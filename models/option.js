const { bookshelf } = require('./base');

const Option =  bookshelf.Model.extend({
	tableName: gConfig.tables.options,
	idAttribute: 'option_id'
});

module.exports = Option;
