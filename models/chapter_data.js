const { bookshelf } = require('./base');

const ChapterData =  bookshelf.Model.extend({
	tableName: gConfig.tables.chapter_data,
	idAttribute: 'data_id'
});

module.exports = ChapterData;
