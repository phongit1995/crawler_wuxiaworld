const download = require('./download');

module.exports = function (options, callback) {
    let { uri, filePath, fileName, subPathUrl, storage } = options;
    return download(uri, filePath, fileName, subPathUrl, callback);
};
