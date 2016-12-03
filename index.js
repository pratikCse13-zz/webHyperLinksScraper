require('events').EventEmitter.prototype._maxListeners = 0;

var express = require('express');
var validator = require('validator');
var csv = require('fast-csv');
var fs = require('fs');
var CONSTANTS = require('./config/constants');
var dns = require('dns');
var async = require('async');
var request = require('request').defaults({maxRedirects: 9});
var cheerio = require('cheerio');

//initializing constants from cinfig file
var start = CONSTANTS.linkToBeScrapped;
var links = [CONSTANTS.linkToBeScrapped];
var scrappedLinks = [CONSTANTS.linkToBeScrapped];
var concurrency = CONSTANTS.concurrency;
var row = CONSTANTS.csvRowLength;
var exportLimit = CONSTANTS.fileExportLimit;
var fileName = CONSTANTS.fileName;

//constants to run the loop
var scraps = 0;
var fileOutputs = 0;



function scrappedLinkCallback(err,$){
	if(err)
		console.log('\nconnection issues: some links could not be connected properly');
	else
	{
		if($ != null)
		{
			if((typeof($) == 'function') && ($('a').length != 0))
	 		{
	 			$('a').each(function(){
	 				var currentLink = $(this).attr('href');
	 				if(typeof(currentLink) == 'string' && validator.isURL(currentLink))
		 			{
		 				links.push(currentLink);
		 				scrappedLinks.push(currentLink);
		 				scraps++;	
	 				}
	 			});
	 		}
		}
	}	
	if(scrappedLinks.length > exportLimit)
	{
		var values = [];
		var times = Math.floor(exportLimit/row);
		for(var i=0;i<times;i++)
		{
			var extracted = scrappedLinks.splice(0,row);
			if(extracted.length > 0)
				values.push(extracted);
		}
		csv.writeToStream(fs.createWriteStream(fileName,{flags: 'a'}),
			              values,
			              	{
			              		headers: false,
			                	includeEndRowDelimiter: true
			              	})
		   .on("finish", function(){
		       fileOutputs += exportLimit; 
		});
	}
}

var q = async.queue(function(link, callback) {
	var index = links.indexOf(link);
	if(index != -1)
		links.splice(index,index+1);
    if(typeof(link) == 'string' && validator.isURL(link))
	{	
		request(link,function(err,res,body){
			var $ = cheerio.load(body);
			callback(err,$);
		});
	}
}, concurrency);

// assign a callback{
q.drain = function() {
	console.log(`\nnumber of scrapped links found until now: ${scraps}`);
    console.log(`number of scrapped links exported to csv until now: ${fileOutputs}`);
    console.log(`${links.length} links left to be scraped`);
    console.log('scraping ........ to stop press: Ctrl+C !!!');
	if(links.length>0)
		q.push(links,scrappedLinkCallback);		
};


if(!fs.existsSync(fileName))
	fs.closeSync(fs.openSync(fileName, 'a'));	
console.log(`\nscraping ${start} and saving to ${fileName}......`);
q.push(links,scrappedLinkCallback);



function exportToFile(kill){
	console.log(`\n${scrappedLinks.length + fileOutputs} links saved\n`);
	var values = [];
	if(scrappedLinks.length>0)
	{
		while(scrappedLinks.length>0)
		{
			var extracted = scrappedLinks.splice(0,row);
			if(extracted.length > 0)
				values.push(extracted);
		}	
		csv.writeToStream(fs.createWriteStream(fileName,{flags: 'a'}),
						  values,
		                  {		
		                  		headers: false,
		                  		includeEndRowDelimiter: true
		                  })
		   .on("finish", function(){
		   	    if(kill)
		   	    	process.kill(process.pid);
		   });
	}
	else
	{
		if(kill)
		   process.kill(process.pid);
	}	
}

process.on('uncaughtException',function(err){
	console.log('connection issues: some links could not be connected properly');
	console.log('\nawaiting pending requests and finishing task.........\n');
	exportToFile(false);
});

process.on('beforeExit',function(){
	exportToFile(true);
});

process.on('SIGINT',function(){
	exportToFile(true);
});

	