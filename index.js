//setting the maximum limit of event listeners to infinity
require('events').EventEmitter.prototype._maxListeners = 0;

var validator = require('validator');
var csv = require('fast-csv');
var fs = require('fs');
var CONSTANTS = require('./config/constants');
var async = require('async');
var request = require('request').defaults({maxRedirects: 9});
var cheerio = require('cheerio');

//initializing constants from config file
var start = CONSTANTS.linkToBeScrapped;
var links = [CONSTANTS.linkToBeScrapped];
var scrappedLinks = [CONSTANTS.linkToBeScrapped];
var concurrency = CONSTANTS.concurrency;
var row = CONSTANTS.csvRowLength;
var exportLimit = CONSTANTS.fileExportLimit;
var fileName = CONSTANTS.fileName;

//counters
var scraps = 0;			//keeps a count of scrapped links
var fileOutputs = 0;	//count of links written to file

//callback for each task of the async queue
function scrappedLinkCallback(err,$){
	//if the request to the link was not successfully returned
	if(err)
		console.log('\nconnection issues: some links could not be connected properly');
	//successful return of the request
	else
	{
		if($ != null)
		{
			if((typeof($) == 'function') && ($('a').length != 0))
	 		{
	 			//iterating over the hyperlinks
	 			$('a').each(function(){
	 				//extracting the link 
	 				var currentLink = $(this).attr('href');
	 				if(typeof(currentLink) == 'string' && validator.isURL(currentLink))
		 			{
		 				//pushing the scrapped link to collection of links which are to be scrapped further
		 				links.push(currentLink);
		 				//pushing the scrapped link to collection of links which are to be written to CSV
		 				scrappedLinks.push(currentLink);
		 				//incrementing the number of scrapped links count 
		 				scraps++;	
	 				}
	 			});
	 		}
		}
	}	
	//if the number of scrapped links increases from a certain limit dump them to CSV
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
		       fileOutputs += (times*row); 
		});
	}
}

//the async queue with the task iterator
var q = async.queue(function(link, callback) {
	//extract the link currently being crawled from the list of links to be crawled
	var index = links.indexOf(link);
	if(index != -1)
		links.splice(index,1);
    if(typeof(link) == 'string' && validator.isURL(link))
	{	
		//making a request to the link 
		var options = {
			url: link,
			timeout: 30000
		};
		request(options,function(err,res,body){
			//loading the DOM of the link into a variable
			var $ = cheerio.load(body);
			//callback of this individual queue task
			callback(err,$);
		});
	}
}, concurrency);

// this is the callback when all tasks of a queue have been completed
q.drain = function() {
	console.log(`\nnumber of scrapped links found until now: ${scraps}`);
    console.log(`number of scrapped links exported to csv until now: ${fileOutputs}`);
    console.log(`${links.length} links left to be scraped`);
    console.log('scraping ........ to stop press: Ctrl+C !!!');
	//if any links were scrapped then scrape them 
	if(links.length>0)
		q.push(links,scrappedLinkCallback);		
};

//this is start of the execution
//checks for write permissions to the folder
fs.access(__dirname, fs.W_OK, function(err) {
	//if there are no write permissions then stops process and asks for permissions
	if(err){
    	console.log('\ndo not have write permissions to this folder');
    	console.log('\nchange permissions and run again\n');
    	process.kill(process.pid);
  	}
  	//if there are write permissions continues			
 	else{	
  		//check if the file to be written to exists and if not create it
		if(!fs.existsSync(fileName))
			fs.closeSync(fs.openSync(fileName, 'a'));	
		console.log(`\nscraping ${start} and saving to ${fileName}......`);
		//the first link queued to be processed
		q.push(links,scrappedLinkCallback);
		//keeps consoling the status in intervals 
		setInterval(function(){
			console.log(`\nnumber of scrapped links found until now: ${scraps}`);
    		console.log(`number of scrapped links exported to csv until now: ${fileOutputs}`);
    		console.log(`${links.length} links left to be scraped`);
    		console.log('scraping ........ to stop press: Ctrl+C !!!');
		},2000);

 	}	
});

//this method writes the scrapped links from memory to file and is called before exceptions and exit calls 
function exportToFile(kill){
	var values = [];
	//if there are any links in memory to be saved to file
	if(scrappedLinks.length>0)
	{
		console.log(`\nover ${scrappedLinks.length + fileOutputs} links saved\n`);
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
	console.log('\nconnection issues: some links could not be connected properly');
	console.log('\nawaiting pending requests and finishing task.........\n');
	exportToFile(false);
});

process.on('beforeExit',function(){
	exportToFile(true);
});

process.on('SIGINT',function(){
	exportToFile(true);
});

	