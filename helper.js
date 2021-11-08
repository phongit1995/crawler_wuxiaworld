const path = require('path');
const sharp = require('sharp');
const moment_timezone = require('moment-timezone');
const moment = require('moment');
const Serialize = require('php-serialize');

const fs = require('fs'), util = require('util'), request = require('request');
const readFile = util.promisify(fs.readFile);
const requestAsync = util.promisify(request);

const helper = {
    random(length = 5) {
        let result = '';
        let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let charactersLength = characters.length;
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
    },
    convertToSlug(text = '') {
        return text
            .toLowerCase()
            .replace(/[^\w ]+/g, '')
            .replace(/ +/g, '-');
    },
    makePath(arr = [], isJoinFirst = false, isJoinLast = true) {
        let newPath = arr.join(path.sep);
        if (isJoinFirst) {
            newPath = path.sep + newPath;
        }
        if (isJoinLast) {
            newPath += path.sep;
        }
        return newPath;
    },

    _resize(filePath, fileName, width, height) {
        return sharp(filePath + fileName).resize(width, height).toFile(filePath + fileName.replace('.jpg', `-${width}x${height}.jpg`));
    },

    _makeSizeList(originPath, fileName) {
        let data = {
            thumbnail:
                {
                    file: 'hahahahaha-150x150.jpg',
                    width: 150,
                    height: 150,
                    'mime-type': 'image/jpeg'
                },
            medium:
                {
                    file: 'hahahahaha-300x200.jpg',
                    width: 300,
                    height: 267,
                    'mime-type': 'image/jpeg'
                },
            'manga-thumb-1':
                {
                    file: 'hahahahaha-110x150.jpg',
                    width: 110,
                    height: 150,
                    'mime-type': 'image/jpeg'
                },
            'manga-single':
                {
                    file: 'hahahahaha-193x278.jpg',
                    width: 193,
                    height: 278,
                    'mime-type': 'image/jpeg'
                },
            manga_wg_post_1:
                {
                    file: 'hahahahaha-75x106.jpg',
                    width: 75,
                    height: 106,
                    'mime-type': 'image/jpeg'
                },
            manga_wg_post_2:
                {
                    file: 'hahahahaha-300x165.jpg',
                    width: 300,
                    height: 165,
                    'mime-type': 'image/jpeg'
                },
            'manga-slider':
                {
                    file: 'hahahahaha-642x320.jpg',
                    width: 642,
                    height: 320,
                    'mime-type': 'image/jpeg'
                },
            madara_misc_thumb_3:
                {
                    file: 'hahahahaha-125x180.jpg',
                    width: 125,
                    height: 180,
                    'mime-type': 'image/jpeg'
                },
            madara_manga_big_thumb:
                {
                    file: 'hahahahaha-175x238.jpg',
                    width: 175,
                    height: 238,
                    'mime-type': 'image/jpeg'
                },
            madara_misc_thumb_1:
                {
                    file: 'hahahahaha-254x140.jpg',
                    width: 254,
                    height: 140,
                    'mime-type': 'image/jpeg'
                },
            madara_misc_thumb_2:
                {
                    file: 'hahahahaha-360x206.jpg',
                    width: 360,
                    height: 206,
                    'mime-type': 'image/jpeg'
                },
            madara_misc_thumb_post_slider:
                {
                    file: 'hahahahaha-642x320.jpg',
                    width: 642,
                    height: 320,
                    'mime-type': 'image/jpeg'
                },
            madara_misc_thumb_4: {
                file: 'hahahahaha-741x630.jpg',
                width: 741,
                height: 630,
                'mime-type': 'image/jpeg'
            }
        };

        let promiseImages = Object.keys(data).map(function (key) {
            return helper._resize(originPath, fileName, data[key].width, data[key].height).then(function () {
                return {
                    ...data[key],
                    file: fileName.replace('.jpg', `-${data[key].width}x${data[key].height}.jpg`),
                    key: key
                }
            });
        });
        return Promise.all(promiseImages).then(results => {
            return results.reduce(function (acc, cur, i) {
                acc[cur.key] = cur;
                delete acc[cur.key].key;
                return acc;
            }, {});
        });
    },

    async makeAttachmentMetadata(fileName) {
        let originPath = gConfig.uploads_path + momentGMT0().format('YYYY') + path.sep + momentGMT0().format('MM') + path.sep;
        if(!fs.existsSync(originPath + fileName)){
        	return null;
		}
        let sizes = await helper._makeSizeList(originPath, fileName);
        let imageInfo = await sharp(originPath + fileName).metadata();

        let object = {
            width: imageInfo.width,
            height: imageInfo.height,
            file: `${momentGMT0().format('YYYY')}/${momentGMT0().format('MM')}/${fileName}`,
            sizes: sizes,
            image_meta:
                {
                    aperture: '0',
                    credit: '',
                    camera: '',
                    caption: '',
                    created_timestamp: '0',
                    copyright: '',
                    focal_length: '0',
                    iso: '0',
                    shutter_speed: '0',
                    title: '',
                    orientation: '0',
                    keywords: []
                }
        };
        return Serialize.serialize(object);
    },
    isURL(str) {
    	str = str || '';
    	str = str.trim();
        return str.startsWith('http://') || str.startsWith('https://');
    },
    async getStream(path) {
        if (helper.isURL(path)) {
            return requestAsync({
				uri: path,
				encoding: null,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36',
					Referer: 'https://1stkissmanga.com/'
				}
			}).then((response) => response.body).catch(() => null);
        }
        return await readFile(path);
    },
    getMomentGTMSetting(gmtOffset, timezoneString){
        if(!gmtOffset){
            return moment_timezone().tz(timezoneString);
        }
        let arr = gmtOffset.split('.');
        if(arr.length === 2){
            return moment().utcOffset(arr[0] + ':' + (arr[1] * 60 / 100));
        }
        return moment().utcOffset(gmtOffset + ':00');
    }
};

module.exports = helper;
