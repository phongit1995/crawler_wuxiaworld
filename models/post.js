const { bookshelf } = require('./base');
const Chapter = require('./chapter');

const Post = bookshelf.Model.extend( {
	tableName: gConfig.tables.post,
	idAttribute: 'ID',
	chapters: function () {
		return this.hasMany(Chapter, 'post_id', 'ID');
	}
});

Post.getDefaultData = function (newData = {}){
	let title = newData.post_title || gHelper.random(8);
	let description = newData.post_content || '';
	let date = momentGTMSetting().format(datetimeFormat);
	let dateGMT = momentGMT0().format(datetimeFormat);
	let oldData = {
		post_author: 1,
		post_date: date,
		post_date_gmt: dateGMT,
		post_content: description,
		post_title: title,
		post_excerpt: '',
		post_status: 'inherit',
		comment_status: 'open',
		ping_status: 'closed',
		post_password: '',
		post_name: gHelper.convertToSlug(title),
		to_ping: '',
		pinged: '',
		post_modified: date,
		post_modified_gmt: dateGMT,
		post_content_filtered: description,
		post_parent: 0,
		guid: 'http://www.toonmanga.com/?post_type=wp-manga&#038;p=',
		menu_order: 0,
		post_type: 'wp-manga', // attachment
		post_mime_type: '', // image/jpeg
		comment_count: 0
	};

	return { ...oldData, ...newData };
};

module.exports = Post;
