module.exports = {
	linkToBeScrapped: process.argv[2] || 'http://www.roposo.com',
	concurrency: process.argv[3] || 5,
	csvRowLength: 10,
	fileName: process.argv[3] || 'links.csv',
	fileExportLimit: 50
}	