/**
 * Created by jaakko on 7.6.2015.
 */

'use strict';

var app = require('express')(),
	swig = require('swig'),
	fs = require('fs'),
	morgan = require('morgan'),
	FileStreamRotator = require('file-stream-rotator'),
	favicon = require('serve-favicon'),
	compression = require('compression');

require('string_score');

var conf = {};
if(process.env.NODE_ENV === 'production') {
	conf.port = 80;
	conf.templateCache = true;
} else {
	conf.port = 3000;
	conf.templateCache = false;
}

var title = 'Dota Responses';

// Read database
global.responses = JSON.parse(fs.readFileSync('dota2.json'));

// Enable Gzip compression
app.use(compression());

// Serve favicon.ico
app.use(favicon(__dirname + '/favicon.ico'));

// Set up morgan logger with file stream rotator
var logDirectory = __dirname + '/log';
// ensure log directory exists
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);
// create a rotating write stream
var accessLogStream = FileStreamRotator.getStream({
	filename: logDirectory + '/access-%DATE%.log',
	frequency: 'daily',
	verbose: false,
	date_format: 'YYYY-MM-DD'
});
// setup the logger
app.use(morgan(':date[iso] :url', {stream: accessLogStream}));



// Use swig template engine
app.engine('html', swig.renderFile);
app.set('view engine', 'html');
app.set('views', __dirname + '/views');
app.set('view cache', false);
if(!conf.templateCache) {
	swig.setDefaults({cache: false});
}



/**
 * Get first response from each unit
 */
var getUnitResponses = function (){
	var responses = [],
		addedUnits = [];

	// Add first response from each unit
	global.responses.forEach(function (response){
		// Unit not yet added and content is the unit name
		if(addedUnits.indexOf(response.unit) === -1){
			responses.push(response);
			addedUnits.push(response.unit);
		}
	});

	// Sort alphabetically by unit name
	responses.sort(function (a, b){
		if(a.unit < b.unit){ return -1; }
		if(a.unit > b.unit){ return 1; }
		return 0;
	});

	return responses;
};
global.unitResponses = getUnitResponses();


/**
 * Responses as associative array indexed by response id
 * @type {Array}
 */
global.responsesById = [];
global.responses.forEach(function (response){
	global.responsesById[response.id] = response;
});


/**
 * Search responses by query
 * @param query Search string without units
 * @param unit Unit name in lower case
 * @returns {Array} Matching responses
 */
var search = function (query, unit){
	if(unit) {
		unit = unit.toLowerCase();
	}

	var responses = [],
		i = 0;

	/**
	 * Hero filter, but no search string -> return all responses from that hero
	 */
	if(!query && unit) {
		for(i = 0; i < global.responses.length; ++i) {
			if(global.responses[i].unit.toLowerCase() === unit){
				responses.push(global.responses[i]);
			}
		}
		return responses;
	}

	/**
	 * Calculate scores for all responses
	 */
	for(i = 0; i < global.responses.length; ++i){
		var response = global.responses[i];
		if(unit && unit !== response.unit.toLowerCase()){
			continue;
		}

		var score = response.content.toLowerCase().score(query.toLowerCase(), 0.8);

		if(score > 0.5){
			responses.push({
				unit: response.unit,
				content: response.content,
				url: response.url,
				id: response.id,
				score: score.toFixed(3)
			});
		}
	}

	/**
	 * Sort by score, content
	 */
	responses.sort(function (a, b){
		if(a.score > b.score){ return -1; }
		if(a.score < b.score){ return 1; }
		if(a.content < b.content){ return -1; }
		if(a.content > b.content){ return 1; }
		return 0;
	});

	return responses;
};


/**
 * Empty search -> return unit responses
 */
app.get('/search/', function (req, res){
	if (req.xhr || req.headers.accept.indexOf('json') > -1) {
		res.render('responses', {responses: global.unitResponses});
	} else {
		res.render('index', {title: title, responses: global.unitResponses});
	}
});


/**
 * Search route with query escape for regexp
 */
app.get('/search/:query(*)', function (req, res){
	var query = req.params.query,
		unit = '',
		words = query.split(' ');

	// Find unit filter, remove it and join rest of the words as a query
	var i = 0;
	while(i < words.length){
		if(words[i][0] === '@'){
			unit = words[i].substring(1, words[i].length);
			words.splice(i, 1);
			break;
		} else {
			++i;
		}
	}
	query = words.join(' ');

	if (req.xhr || req.headers.accept.indexOf('json') > -1) {
		res.render('responses', {
			responses: search(query, unit),
			query: req.params.query
		});
	} else {
		res.render('index', {
			title: title,
			responses: search(query, unit),
			query: req.params.query
		});
	}
});


/**
 * Index
 */
app.get('/', function (req, res){
	res.render('index', {title: title, responses: global.unitResponses});
});


/**
 * Get single response by response id
 */
app.get('/:id(*)', function (req, res){
	var response = global.responsesById[parseInt(req.params.id)];
	if(response){
		res.render('index', {title: response.content, responses: [response]});
	} else {
		res.status(404).render('error', {
			title: '404 - Response not found',
			responses: search('Lost in the woods, are you?', 'luna'),
			errorMessage: '404 - Response not found'
		});
	}
});


/**
 * Start server
 */
var server = app.listen(conf.port, function (){
	var host = server.address().address;
	var port = server.address().port;
	console.log('Server started at ' + host + ':' + port);
});