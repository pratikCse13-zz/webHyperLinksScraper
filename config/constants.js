module.exports = {
	linkToBeScrapped: process.argv[2] || 'https://www.medium.com',
	concurrency: process.argv[4] || 5,
	csvRowLength: 10,
	fileName: process.argv[3] || 'links.csv',
	fileExportLimit: 100
}	