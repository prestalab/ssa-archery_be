var log     = require('cllc')();
var tress   = require('tress');
var needle  = require('needle');
var cheerio = require('cheerio');
var sqlite3 = require('sqlite3').verbose();


var sCookie = 'http://www.ssa-archery.be/products.php?lang=en';

var httpOptions = {};
var results     = [];
var urls     = [];

var q = tress(crawl, 1);

// q.success = function () {
// 	q.concurrency = 1;
// };



// q.retry = function () {
// 	q.concurrency = -10000;
// }
// q.error = function () {
// 	log('q.failed', q.failed);
// }

var db = new sqlite3.Database('data.sqlite');


db.serialize(function () {
	db.run('CREATE TABLE IF NOT EXISTS data (url TEXT, group_name TEXT, class_name TEXT, brand TEXT, reference PRIMARY KEY, price REAL, avb NUMERIC, img TEXT, name TEXT)');
});

q.drain = function () {


	console.log('failed', q.failed);
	// console.log(results);
	db.close();
	log(q.failed);
	log.finish();
	log('Работа закончена');
	
};

var options = {
	follow_max: 1,
	follow_set_cookies:true,
	follow_set_referer:true,
	user_agent: "Mozilla/5.0 (Windows NT 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.1 Safari/537.36"
};

needle.get(sCookie, options, function (err, res) {
	if (err || res.statusCode !== 200)
		throw err || res.statusCode;
	
	httpOptions.cookies    = res.cookies;
	httpOptions.user_agent = "Mozilla/5.0 (Windows NT 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2227.1 Safari/537.36";
	log('Начало работы');
	console.log(res.cookies);
	q.push({url: 'http://www.ssa-archery.be/products.php?sort=group', type: 'main'});
	//q.push({url: 'http://www.ssa-archery.be/products.php?cat=STABILIZERS+%26+DAMPERS+%26+PARTS&class=V-BAR+EXTENDERS&sort=group', type: 'class', group_name: 'x', class_name: 'y'});
});


function crawl(data, callback) {
	needle.get(data.url, httpOptions, function (err, res) {
		// console.log('needle');
		var statusCode = 200;
		if (err || res.statusCode !== 200) {
			q.concurrency === 1 && log.e((err || res.statusCode) + ' - ' + data.url);
			
			
			statusCode = res.statusCode;
			// return callback(new Error('302'));
			// return callback(null);
		}

		var $ = cheerio.load(res.body);

		if (data.type == 'class') {
			product = {};
			reference_old = '';
			$('tr',$('table').first()).each(function(i, tr){
				row = $('td', this);
				reference = row.eq(2).text();
				name = row.eq(1).text().trim();
				if ((reference != '')&&(reference != ' ')&&(reference != 'Code/Description')&&(reference != ' €')){

					product[reference] = {};
					product[reference]['url'] = data.url;
					product[reference]['group_name'] = data.group_name;
					product[reference]['class_name'] = data.class_name;
					product[reference]['brand'] = name;
					product[reference]['reference'] = reference;
					product[reference]['price'] = row.eq(4).text().trim();
					avb = $('td', row.eq(5)).prop('style');
					if (avb['background-color'] == 'green') {
						product[reference]['avb'] = 1;
					} else if (avb['background-color'] == 'orange') {
						product[reference]['avb'] = 2;
					} else {
						product[reference]['avb'] = 0;
					}
					img = $('a', row.eq(0)).prop('href');
					if (img != 'look/blank.gif') {
						product[reference]['img'] = 'http://www.ssa-archery.be/'+img;
					} else {
						product[reference]['img'] = '';
					}
					reference_old = reference;
				} else if ((name != '')&&(name != 'Brand')) {
					product[reference_old]['name'] = name;
				}
			});

			db.serialize(function () {
				var stmt = db.prepare('INSERT OR REPLACE INTO data VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
				Object.keys(product).map(function (key) {
					r = product[key];
					stmt.run(Object.keys(r).map(function (key) {return r[key];})); 
					
				});
				stmt.finalize();
			});
			results = results.concat(product);

			urls.push(data.url);
			$('.button').each(function(i, a){
				new_url = 'http://www.ssa-archery.be/products.php'+$(this).prop('href');

				if ((new_url.indexOf('page=1') == -1)&&(urls.indexOf(new_url) == -1)) {
					urls.push(new_url);
					q.push({url: new_url, type: 'class', group_name: data.group_name, class_name: data.class_name});
				}
			})
		} else if (data.type == 'main') {
			$('.list-group-item').each(function(i, a){
				q.push({url: 'http://www.ssa-archery.be/'+$(this).prop('href'), type: 'group', group_name: $('td', this).text().trim()});
			})
		} else if (data.type == 'group') {
			$('.list-group-item').each(function(i, a){
				q.push({url: 'http://www.ssa-archery.be/'+$(this).prop('href'), type: 'class', group_name: data.group_name, class_name: $('td', this).text().trim()});
			})
		}
		console.log(data.url);
		log.step(0, 0, 1);
		callback();
	});
}