'use strict';

var fs = require('fs'),
	async = require('async'),
	request = require('request');

var hrefs,
	urls = [],
	tasks = [],
	invalids = [];

/**
 * Read responses from dota2.json file
 */
var responses = [];
try {
	responses = JSON.parse(fs.readFileSync('dota2.json'));
} catch (error) {
	console.error(error);
	responses = [];
}
console.log('Read', responses.length, 'responses from dota2.json');

/**
 * Read urls from links.txt file
 */
var str = fs.readFileSync('links.txt', 'utf8');
hrefs = str.split(' ');
hrefs.forEach(function (href){
	if(href.indexOf('href') !== -1){
		var name = href.split('"')[1];
		urls.push({url: 'http://dota2.gamepedia.com' + name, name: name});
	}
});

var newResponses = 0;
/**
 * Update or add new response
 * @param unit
 * @param content
 * @param url
 */
function updateResponse (unit, content, url) {
	// Search for existing response and update it
	for(var i = 0; i < responses.length; ++i){
		if(responses[i].url === url){
			responses[i].unit = unit;
			responses[i].content = content;
			return;
		}
	}

	// Existing not found, add new
	responses.push({
		unit: unit,
		content: content,
		url: url,
		id: responses.length + 1
	});
	++newResponses;
}


/**
 * Download html page with giver URL
 * Parse all responses from downloaded page
 */
urls.forEach(function (url){
	tasks.push(function (callback) {
		request(url.url, function(error, response, body) {
			if(!error && response.statusCode == 200) {
				var unit = url.name.split(/responses/i)[0].split(/announcer/i)[0].replace(/_/g, '');
				unit = unescape(unit);
				if(unit[0] === '/'){
					unit = unit.substring(1, unit.length);
				}

				var elems = body.match(/<li>([\s\S]*?)<\/li>/gm);
				elems.forEach(function(elem) {
					var url = elem.match(/\/[a-z0-9]\/.*?mp3/);
					if(url && url.length && unit) {
						var content = elem.split('</a>');
						content = content[content.length - 1];
						content = content.substring(0, content.length - 5);
						content = content.replace(/<\w+>.+<\/\w+>/, ''); // Remove HTML (remarks)
						content = content.replace(/\(.+\)/, ''); // Remove anything inside braces (remarks)
						content = content.trim();
						content = unescape(content);
						url = 'http://hydra-media.cursecdn.com/dota2.gamepedia.com' + url[0];
						if(content) {
							updateResponse(unit, content, url);
						} else {
							invalids.push(elem);
						}
					} else {
						invalids.push(elem);
					}
				});
				callback(null);
			} else {
				callback(error);
			}
		});
	});
});


/**
 * Write responses into JSON
 */
async.parallel(tasks, function (error){
	if(error){
		console.log('ERROR:', error);
	}

	console.log(newResponses, 'new responses');

	fs.writeFile('dota2.json', JSON.stringify(responses), function (err){
		if(err){
			console.log('err:', err);
		}
	});

	if(invalids.length){
		fs.writeFile('invalids.txt', invalids.join('\n\n'), function (err){
			if(err){
				console.log('err:', err);
			}
		});
	}
});
