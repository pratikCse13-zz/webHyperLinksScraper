require('events').EventEmitter.prototype._maxListeners = 0;

var express = require('express');
var validator = require('validator');
var csv = require('fast-csv');
var fs = require('fs');
var cheerio = require('cheerio');
var CONSTANTS = require('./config/constants');
var dns = require('dns');
var request = require('request').defaults({maxRedirects: 9});

//initializing constants from cinfig file
var start = CONSTANTS.linkToBeScrapped;
var links = [CONSTANTS.linkToBeScrapped];
var scrappedLinks = [CONSTANTS.linkToBeScrapped];
var concurrency = CONSTANTS.concurrency;
var row = CONSTANTS.csvRowLength;
var exportLimit = CONSTANTS.fileExportLimit;
var fileName = CONSTANTS.fileName;

//constants to run the loop
var running = 0;
var scraps = 0;
var fileOutputs = 0;


//main function which is called again and again with a set of crawled links
function crawl(){
    while(running < concurrency && links.length > 0) {
        var link = links.shift();
        if(typeof(link) == 'string' && validator.isURL(link))
		{	
			request(link,function(err,res,body){
				running--;
				if(err)
				{	
					console.log('\nconnection issues: some links could not be connected');
					console.log('checking for internet connection');
					dns.lookup(start,function(err){
						if(err && err.code == 'ENOTFOUND')
						{	
							console.log('no interbet');
							process.exit(0);
						}	
					});
				}
				else
				{
					var $ = cheerio.load(body);
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
			 			});
			 		}
				}
				if(links.length > 0)
				{
					console.log(`\n${links.length} links left to be scrapped`);
					crawl();	
				}
			});
			running++;
		}	
    }
    console.log('\nnumber of scrapped links found uptil now: '+scraps);
    console.log('number of scrapped links exported to csv uptil now: '+fileOutputs);
    console.log('scraping ........ to stop press: Ctrl+C !!!');
}

if(!fs.existsSync(fileName))
	fs.closeSync(fs.openSync(fileName, 'a'));	
console.log(`scraping ${start} and saving to ${fileName}......`);
crawl();

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
	console.log('uncaught called');
	console.log(err);
	exportToFile(false);
});

process.on('beforeExit',function(){
	console.log('before exit called');
	exportToFile(true);
});

process.on('SIGINT',function(){
	console.log('sigint called');
	exportToFile(true);
});

	