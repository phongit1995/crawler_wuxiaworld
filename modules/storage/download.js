const fs = require('fs');
const downloader = require('image-downloader');

module.exports = function (uri, filePath, fileName, subPathUrl, callback = null) {
	return new Promise(resolve => {
		let temp = filePath + fileName;

		let urlPath = subPathUrl + fileName;

		if(fs.existsSync(temp)){
			callback && callback(urlPath);
			return resolve(urlPath);
		}

		if(!fs.existsSync(filePath)){
			fs.mkdirSync(filePath, { recursive: true });
		}

		if(uri.includes(';base64,')) {
			fs.writeFileSync(temp, uri.split(';base64,').pop(), {encoding: 'base64'});
			callback && callback(urlPath);
			return resolve(urlPath);
		}

		downloader.image({
			url: uri,
			dest: temp,
			headers: gHeaders
		})
			.then(({ fileName, image }) => {
				callback && callback(urlPath);
				resolve(urlPath);
			})
			.catch((err) => {
				console.log('Fail image: ' , err);
				callback && callback(false);
				resolve(false);
			});
	});
};
