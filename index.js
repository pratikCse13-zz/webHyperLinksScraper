require('events').EventEmitter.prototype._maxListeners = 0;

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
var running = 0;    	//concurrency count
var scraps = 0;    		//count of scrapped links
var fileOutputs = 0;	//count of links written in file


//main function which is called recursively with a set of scraped links
function crawl(){
	//while concurrency is less than defined value and there are links left 
    while(running < concurrency && links.length > 0) {
    	//extract the first link from links array
        var link = links.shift();
        if(typeof(link) == 'string' && validator.isURL(link))
		{	
			//request made to the link
			request(link,function(err,res,body){
				//on receive of response reduce concurrency count by 1
				running--;
				//if the request did not return properly
				if(err)
					console.log('\nconnection issues: some links could not be connected');	
				//successful return of the request
				else
				{
					//load the DOM of the response
					var $ = cheerio.load(body);
					if((typeof($) == 'function') && ($('a').length != 0))
			 		{
			 			//iterate over the links present in the DOM
			 			$('a').each(function(){
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
								       fileOutputs += exportLimit; 
								});    
			 				}
			 			});
			 		}
				}
				//if any links were scrapped them crawl them
				if(links.length > 0)
				{
					console.log(`\n${links.length} links left to be scrapped`);
					crawl();	
				}
			});
			//increment the concurrency count after making the request
			running++;
		}	
    }
    console.log('\nnumber of scrapped links found until now: '+scraps);
    console.log('number of scrapped links exported to csv until now: '+fileOutputs);
    console.log('scraping ........ to stop press: Ctrl+C !!!');
}

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
		crawl();
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

	