const chalk = require('chalk'),
	async = require('async'),
	Request = require('request'),
	cheerio = require('cheerio'),
	moment = require('moment'),
	moment_timezone = require('moment-timezone'),
	fs = require('fs'),
	path = require('path');
const bodyParser = require('body-parser');

const CronJob = require('cron').CronJob;
const express = require('express');
const app = express();

const mimeTypeOrigin = 'wuxiaworld';
const mimeTypeSplit = '.';

const domain = 'https://wuxiaworld.site';

const parseRowPack = function (obj) {
	try {
		return JSON.parse(JSON.stringify(obj[0]))
	} catch (e) {
		return null;
	}
};
global.gConfig = require('./config');
global.datetimeFormat = 'YYYY-MM-DD HH:mm:ss';
global.gHelper = require('./helper');
global.momentGMT0 = () => moment().utcOffset('+00:00');
global.momentGTMSetting = () => moment_timezone().tz('Asia/Ho_Chi_Minh');

const {Post, Chapter, ChapterData, PostMeta, TermRelationship, Option, Term, TermTaxonomy, knex} = require('./models');
(function () {
	Option.query(function (qb) {
		return qb.where('option_name', '=', 'timezone_string').orWhere('option_name', '=', 'gmt_offset');
	})
		.fetchAll()
		.then(model => {
			let data = model.toJSON();
			let gmtOffset = data.find(x => x.option_name === 'gmt_offset').option_value || null;
			let timezoneString = data.find(x => x.option_name === 'timezone_string').option_value || null;
			momentGTMSetting = () => gHelper.getMomentGTMSetting(gmtOffset, timezoneString);
		})
		.catch(error => console.log('Query option table', error));
})();

const storage = require('./modules/storage');

global.gHeaders = {
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.97 Safari/537.36',
	'Referer': domain,
	'referer': domain,
};

async function getPostList(page = 0) {
	let link = `${domain}/novel-list?m_orderby=latest&page=${(page + 1)}`;
	return new Promise(resolve => {
		Request({
			method: 'GET',
			url: link,
			headers: gHeaders
		}, function (error, response, body) {
			try {
				const $ = cheerio.load(body);
				const list = $('.page-item-detail').map(function () {
					return {
						episode: $(this).find('.item-thumb').attr('data-post-id'),
						title: $(this).find('.item-thumb>a').attr('title'),
						image: $(this).find('img').attr('data-src') || $(this).find('img').attr('src'),
						link: $(this).find('.item-thumb>a').attr('href'),
						total_chapter: $(this).find('.list-chapter>.chapter-item:first-child a.btn-link').text().trim().split(' ').pop(),
						total_vote: $(this).find('.total_votes').text()
					}
				}).toArray();
				resolve(list);
			} catch (e) {
				console.error('getPostList', e);
				resolve([]);
			}
		});
	})
}

async function getDetailPost(episodeId) {
	return new Promise(resolve => {
		let link = `${domain}?post_type=wp-manga&p=${episodeId}`;
		Request({
			url: link,
			headers: gHeaders
		}, function (error, response, body) {
			try {
				const $ = cheerio.load(body);
				const $comicInfo = $('body');
				let $cover = $comicInfo.find('.summary_image>a>img');
				let width = $cover.attr('width');
				let height = $cover.attr('height');
				let cover = $cover.attr('src').replace(`-${width}x${height}`,'');
				if(!cover.startsWith('http')){
					cover = 'https:' + cover;
				}
				let title = $('ol.breadcrumb>li:nth-child(2)>a').text().trim();
				let genres = $comicInfo.find('.genres-content>a').map(function () {
					return $(this).text().trim();
				}).toArray();
				let tags = $comicInfo.find('.wp-manga-tags-list>a').map(function () {
					return $(this).text().trim();
				}).toArray();
				let description = $comicInfo.find('.summary__content p').text().trim();
				description = description
					.replace('WuxiaWorld.Site', gConfig.domain + '. ')
					.replace('wuxiaworld.site', gConfig.domain + '. ');

				let authors = $('.author-content>a').map((i, v) => $(v).text()).toArray().map(x => x.trim()) || [];
				let artists = $('.artist-content>a').map((i, v) => $(v).text()).toArray().map(x => x.trim()) || [];
				let release = $('.post-status>.post-content_item:first-child>.summary-content>a').text(); release = release ? release.trim() : null;
				let originTitle = $('.post-content>div:nth-child(5)>.summary-content');
				originTitle = originTitle ? originTitle.text().trim() : null;
				if(originTitle === 'Updating'){
					originTitle = null;
				}

				let chapterList = $('ul.version-chap>li>a').map(function (index) {
					let title = $(this).text().trim();
					if(title.includes('-') || title.includes(':')){
						title = title.split(/[-:]/g)[0].trim();
					}
					return {
						url: $(this).attr('href'),
						title: title
					};
				}).toArray()
					.filter(x => x.title)
					.reverse()
					.map((x, index) => {
						return {
							...x,
							weight: index
						};
					});

				let item = {
					cover,
					title,
					genres,
					description,
					chapterList,
					episodeId,
					authors,
					artists,
					release,
					tags,
					originTitle
				};
				resolve(item);
			} catch (e) {
				console.error('getDetailPost', episodeId, e.message);
				resolve(null);
			}
		});
	})
}

async function getChapterContent(link, retries = 3) {
	return new Promise(resolve => {
		Request({
			url: link,
			headers: gHeaders
		}, function (error, response, body) {
			try {
				const $ = cheerio.load(body);
				let content = $('.reading-content p').map(function () {
					return `<p>${$(this).html()}</p>`;
				}).toArray().join('');
				if(content){
					content = content.replace(/WuxiaWorld/g, gConfig.domain)
						.replace(/wuxiaworld/g, gConfig.domain)
						.replace(/wuxiaworld.site/g, gConfig.domain);
				}
				resolve(content);
			} catch (e) {
				if(--retries > 0){
					return resolve(getChapterContent(link, retries));
				}
				console.error('Error getChapterContent', link, e.message);
				resolve(null);
			}
		});
	})
}

async function createTerm(postId, obj = {}){
	if(!gConfig.tables.term || !gConfig.tables.term_taxonomy || !obj.name || !obj.taxonomy){
		return null;
	}
	obj.name = obj.name.trim();
	let sql =`SELECT * FROM ${gConfig.tables.term} t join ${gConfig.tables.term_taxonomy} tt on t.term_id = tt.term_id where t.name = '${obj.name}' and tt.taxonomy = '${obj.taxonomy}'`;
	let result = await knex.raw(sql).catch(e => null);
	result = parseRowPack(result) || [];
	let termTaxonomy = result[0];

	if(!termTaxonomy){
		let term = await new Term({ name: obj.name, slug: gHelper.convertToSlug(obj.name) }).save(null, {method: 'insert'});
		termTaxonomy = await new TermTaxonomy({ term_id: term.id, taxonomy: obj.taxonomy, description: '' }).save(null, {method: 'insert'});
		termTaxonomy = termTaxonomy.toJSON();
	}

	let exists = await new TermRelationship({ object_id: postId, term_taxonomy_id: termTaxonomy.term_taxonomy_id }).fetch().catch(e => null);
	if(termTaxonomy && !exists){
		return new TermRelationship({ object_id: postId, term_taxonomy_id: termTaxonomy.term_taxonomy_id }).save(null, {method: 'insert'});
	}
	return null;
}

async function createPost(post) {
	let postData = {
		post_content: post.description || '',
		post_title: post.title || '',
		post_status: 'pending',
		guid: `${gConfig.domain}/?post_type=wp-manga&#038;p=`,
		post_type: 'wp-manga',
		post_mime_type: mimeTypeOrigin + mimeTypeSplit + post.episodeId,
	};
	let postThumbnailData = {
		post_status: 'inherit',
		guid: '',
		post_type: 'attachment',
		post_mime_type: 'image/jpeg',
	};
	return new Post({post_title: post.title, post_type: 'wp-manga'}).fetch().then(function (pModel) {
		return pModel.toJSON();
	}).catch(function (error) {
		return new Post(Post.getDefaultData(postData)).save(null, {method: 'insert'}).then(async model => {
			model.set('guid', model.get('guid') + model.id);
			await model.save();
			return model.toJSON()
		}).catch((error) => {
			console.log('Error create post', error);
			return null;
		});
	}).then(function (pModel) {
		let subPath = gHelper.makePath([momentGMT0().format('YYYY'), momentGMT0().format('MM')]);

		let subPathUrl = momentGMT0().format('YYYY') + '/' + momentGMT0().format('MM') + '/';
		let imageName = 'post_' + pModel.ID + '_image.jpg';
		let thumbnailUrl = '/wp-content/uploads/' + subPathUrl + imageName;

		let promiseCreateImage = new Post({post_parent: pModel.ID, post_type: 'attachment' }).fetch().then((model) => {
			return new Promise(resolve => {
				resolve({
					_thumbnail_id: model.id,
					manga_banner: thumbnailUrl,
					_wp_attached_file: subPathUrl + imageName
				});
			})
		}).catch(function (error) {
			return new Promise(resolve => {
				let folderPath = gConfig.uploads_path + subPath;
				let imageUrl = '/wp-content/uploads/' + subPathUrl + imageName;
				storage({
					uri: post.cover, filePath: folderPath, fileName: imageName, subPathUrl: subPathUrl, storage: 'local'
				}, function (location) {
					new Post({
						...Post.getDefaultData(postThumbnailData),
						post_parent: pModel.ID,
						guid: imageUrl,
						post_title: imageName.replace('.jpg', '').replace('.png', ''),
						post_name: imageName.replace('.jpg', '').replace('.png', '')
					}).save(null, {method: 'insert'}).then(model => {
						resolve({
							_thumbnail_id: model.id,
							manga_banner: thumbnailUrl,
							_wp_attached_file: subPathUrl + imageName
						})
					}).catch(() => resolve(null));
				});
			});
		}).then(function (pModelThumbnail) {
			if (pModelThumbnail) {
				return gHelper.makeAttachmentMetadata(imageName).then(function (serString) {
					let data = {
						...pModelThumbnail,
						_wp_manga_status: 'on-going',
						_wp_manga_chapter_type: 'text',
						_wp_manga_alternative: post.originTitle || ''
					};
					if(serString){
						data['_wp_attachment_metadata'] = serString;
					}
					return PostMeta.createMeta(pModel.ID, data);
				});
			} else {
				return null;
			}
		}).catch(error => {
			console.log('Error create postmeta', error.message);
			return null;
		});

		let genres = post.genres.map(name => ({ name: name, taxonomy: 'wp-manga-genre' }));
		let authors = post.authors.map(name => ({ name: name, taxonomy: 'wp-manga-author' }));
		let artists = post.artists.map(name => ({ name: name, taxonomy: 'wp-manga-artist' }));
		let objs = [
			{ name: post.release, taxonomy: 'wp-manga-release' },
			...genres,
			...authors,
			...artists
		];

		let promiseTags = new Promise(resolve => {
			async.eachLimit(post.tags || [], 15, function (tag, doneTag) {
				createTerm(pModel.ID, { name: tag, taxonomy: 'wp-manga-tag' }).finally(doneTag);
			},function () {
				resolve();
			})
		});

		let promiseTerm = Promise.all(objs.map(obj => createTerm(pModel.ID, obj)));
		return Promise.all([promiseCreateImage, promiseTerm, promiseTags]).then(arr => pModel);
	});
}

async function updateModifiedPostTime(postId) {
	return new Post({ID: postId}).fetch().then(function (pModel) {
		let date = momentGTMSetting().format(datetimeFormat);
		let dateGMT = momentGMT0().format(datetimeFormat);
		pModel.set('post_modified', date);
		pModel.set('post_modified_gmt', dateGMT);
		pModel.save();
		PostMeta.updateModified(postId);
		return pModel;
	}).catch((error) => error);
}

async function createChapter(postId, chapter) {
	let chapterName = chapter.title || '';
	let chapterSlug = gHelper.convertToSlug(chapterName) || '';
	let chapterValue = {
		chapter_name: chapterName,
		chapter_slug: chapterSlug,
		storage_in_use: gConfig.use_storage
	};

	let model = await Chapter.where({post_id: postId, chapter_name: chapterName}).fetch().catch((error) => null);
	if(!model){
		model = await new Chapter(Chapter.getDefaultData(postId, chapterValue)).save(null, {method: 'insert'})
			.catch((error) => {
				console.log('Cannot insert chapter data', error);
				return false;
			});
	}
	if(!model){
		console.log('Cannot create model chapter data');
		return false;
	}

	let chapterContent = await new Post({ post_parent: model.id, post_type: 'chapter_text_content' }).fetch().catch(e => false);
	if(!chapterContent){
		let post_title = model.id + '-' + chapterSlug;
		let postThumbnailData = {
			post_content: chapter.content,
			post_title: post_title,
			post_status: 'publish',
			comment_status: 'closed',
			post_name: post_title,
			post_parent: model.id,
			guid: `${gConfig.domain}/chapter_text_content/${post_title}/`,
			post_type: 'chapter_text_content',
			post_mime_type: '',
		};
		return new Post(Post.getDefaultData(postThumbnailData)).save(null, {method: 'insert'}).then(() => true).catch((e) => {
			console.log('Error create chapterContent', e.message);
			return false;
		});
	}
	return true;
}

function leechPostSingle(episodeId, callback, res = null) {
	getDetailPost(episodeId).then(function (detailPost) {
		if (!detailPost) {
			console.log(chalk.blueBright(' -> Cannot found post:'), episodeId);
			if (res) {
				res.write(' -> Cannot found post: ' + episodeId + '<br/>');
			}
			callback();
			return false;
		}
		console.log(chalk.blueBright(' -> Leeching post:'), detailPost.title);
		if (res) {
			res.write(' -> Leeching post: ' + detailPost.title + '<br/>');
		}
		createPost(detailPost).then(function (postModel) {
			if (!postModel) {
				callback();
				console.log(chalk.redBright(' -> Cannot create post:'), detailPost.title);
				if (res) {
					res.write(' -> Cannot create post: ' + detailPost.title + '<br/>');
				}
				return false;
			}
			async.eachLimit(detailPost.chapterList, 10, function (chapter, doneChapter) {
				console.log(chalk.blue(' ---> Leeching chapter:'), chapter.title);
				if (res) {
					res.write(' <b>---> Leeching chapter: ' + chapter.title + '</b><br/>');
				}
				Chapter.where({post_id: postModel.ID, chapter_name: chapter.title}).fetch().catch((error) => null).finally(exist => {
					if(exist){
						console.log(chalk.blueBright(' ===> Chapter exist:'), chapter.title);
						if (res) {
							res.write(' ===> Chapter exist: ' + chapter.title + '<br/>');
						}
						return doneChapter();
					}
					getChapterContent(chapter.url).then(function (content) {
						if (!content) {
							console.log(chalk.redBright(' ===> Leeched chapter:'), chapter.title, ' -> error');
							if (res) {
								res.write(' ===> Leeched chapter: ' + chapter.title + '  -> error' + '<br/>');
							}
							doneChapter();
							return false;
						}
						chapter.content = content;
						createChapter(postModel.ID, chapter).finally((result)=>{
							console.log(chalk.blueBright(' ===> Leeched chapter:'), chapter.title);
							if (res) {
								res.write(' ===> Leeched chapter: ' + chapter.title + '<br/>');
							}
							if (result) {
								updateModifiedPostTime(postModel.ID, episodeId).finally(doneChapter);
							} else {
								doneChapter();
							}
						});
					});
				})
			}, function () {
				callback();
			});
		});
	});
}

function leechPosts(postList, callback, res = null) {
	async.eachLimit(postList, 1, function (postId, donePost) {
		leechPostSingle(postId, function () {
			donePost();
		}, res);
	}, function () {
		callback();
		console.log(chalk.red.bold('Leech done'));
	});
}

function updateChapter() {
	console.log(chalk.green.bold('Start update chapter'));
	let sql = `SELECT p.ID, p.post_title, p.post_type, p.post_mime_type, pm.meta_key,  pm.meta_value 
        FROM ${gConfig.tables.post} p, ${gConfig.tables.post_meta} pm WHERE post_type = 'wp-manga' AND post_mime_type LIKE '${mimeTypeOrigin}${mimeTypeSplit}%' AND pm.meta_key = '_wp_manga_status' AND meta_value = 'on-going'
        GROUP BY p.ID`;
	knex.raw(sql).then(function (result, error) {
		if (result && !error) {
			let models = parseRowPack(result) || [];
			if (models.length) {
				models = models.map(x => {
					return {
						...x,
						postId: x.post_mime_type.split(mimeTypeSplit).pop() || null
					};
				}).filter(x => x);
				async.eachLimit(models, 1, function (post, donePost) {
					leechPostSingle(post.postId, function () {
						donePost();
					});
				}, function () {
					console.log(chalk.red.bold('Done update chapter'));
				});
			}
		}
	});
}

app.all('*', function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
	res.header("Access-Control-Allow-Headers", "Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
	next();
});
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.get('/', (req, res) => {
	Promise
		.all([getPostList(0), getPostList(1), getPostList(2)])
		.then(array => [].concat(...array).filter(x => x))
		.then(array => [...new Set(array.map(item => item.episode))].map(episode => array.find(x => x.episode === episode)))
		.then(array => {
			let ps = array.map(i => {
				return new Post({post_title: i.title}).fetch({withRelated: ['chapters']}).then(function (pModel) {
					return {
						...i,
						is_leeched: true,
						chapter_count: pModel.related('chapters').length
					}
				}).catch(function () {
					return {
						...i,
						is_leeched: false,
						chapter_count: 0
					}
				});
			});
			return Promise.all(ps);
		})
		.then(list => {
			return res.render('index', {
				list
			});
		});
});

function getLeechId(res, id) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	res.write('Leeching...... ' + '<br/>');
	leechPosts(id, function () {
		res.end('<b> =====> Leech done <===== </b>');
	}, res);
}

app.get('/leech-link', (req, res) => {
	let {link} = req.query;
	Request({
		url: link.trim(),
		headers: gHeaders
	}, function (error, response, body) {
		try {
			const $ = cheerio.load(body);
			let id = $('input.rating-post-id').val();
			if(!id || !parseInt(id)){
				return res.end('Error leech link...... ' + link + '<br/>');
			}
			getLeechId(res, [id]);
		} catch (e) {
			res.end('Error leech link...... ' + link + '<br/>');
		}
	});
});

app.get('/leech', (req, res) => {
	let {id} = req.query;
	getLeechId(res, id);
});

app.get('/image', function (req, res) {
	let {url} = req.query;
	try{
		Request.get(url, { headers: gHeaders }).pipe(res);
	} catch (e) {
		res.sendFile(__dirname + '/public/image/default.png');
	}
});

let leechingPost = {};

app.post('/api/leech/post',  (req, res) => {
	let detailPost = req.body;
	if(!detailPost || !detailPost.episodeId){
		return res.json({ success: false, message: 'Error request' });
	}
	if(leechingPost[detailPost.episodeId]){
		return res.json({ success: false, message: 'The novel has been leeching, please wait!' });
	}
	leechingPost[detailPost.episodeId] = true;
	console.log(chalk.blueBright(' -> Leeching post:'), detailPost.title);
	createPost(detailPost).then(function (postModel) {
		if (!postModel) {
			console.log(chalk.redBright(' -> Cannot create post:'), detailPost.title);
			return res.json({ success: false, message: 'Cannot create post' });
		}
		console.log(chalk.blueBright(' -> Created post:'), detailPost.title);
		delete leechingPost[detailPost.episodeId];
		return res.json({ success: true, message: 'Create post successfully', data: { id: postModel.ID } });
	}).catch(error => {
		console.log(chalk.redBright(' -> Error create post:'), detailPost.title, error.message);
		res.json({ success: false, message: 'Error ' + error.message })
	});
});

app.post('/api/leech/chapter', (req, res) => {
	let { post, chapter } = req.body;
	if(!post || !post.id || !chapter){
		return res.json({ success: false, message: 'Error request' });
	}
	Chapter.where({post_id: post.id, chapter_name: chapter.title}).fetch().catch((error) => null).finally(exist => {
		if(exist){
			console.log(chalk.blueBright(' ===> Chapter exist:'), chapter.title);
			return res.json({ success: false, message: 'Chapter exist: ' + chapter.title });
		}
		createChapter(post.id, chapter).then((result)=>{
			console.log(chalk.blueBright(' ===> Leeched chapter:'), chapter.title, result);
			res.json({ success: result, message: ' ===> Leeched chapter: ' + chapter.title });
			result && updateModifiedPostTime(post.id);
		}).catch(error => {
			console.log(chalk.redBright(' ===> Leeched chapter:'), chapter.title, error.message);
			res.json({ success: false, message: ' ===> Leeched chapter: ' + chapter.title });
		});
	})
});

const server = app.listen(gConfig.server.port || 3000, () => {
	console.log(`Server running → PORT ${server.address().port}`);
});

// (function () {
// 	const os = require('os');
// 	new CronJob('0 0 */2 * * *', function () {
// 		updateChapter();
// 		fs.appendFileSync('./cron_log.txt', momentGTMSetting().format(datetimeFormat) + os.EOL);
// 	}, null, true, 'Asia/Ho_Chi_Minh');
// })();
// updateChapter();
