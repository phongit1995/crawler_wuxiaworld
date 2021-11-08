const { bookshelf } = require('./base');
const moment = require('moment');

const Chapter = bookshelf.Model.extend({
	tableName: gConfig.tables.chapter,
	idAttribute: 'chapter_id'
});

Chapter.getDefaultData = function (postId, newData = {}){
	let chapterName = newData.title || '';
	let oldData = {
		post_id: postId,
		volume_id: 0,
		chapter_name: chapterName,
		chapter_name_extend: '',
		chapter_slug: gHelper.convertToSlug(chapterName) || '',
		storage_in_use: 'local',
		date: momentGTMSetting().format(datetimeFormat),
		date_gmt: momentGMT0().format(datetimeFormat),
		// chapter_index: 0,
		// chapter_seo: null,
		// chapter_warning: null,
		// chapter_status: 0
	};

	return {...oldData, ...newData};
};

module.exports = Chapter;
