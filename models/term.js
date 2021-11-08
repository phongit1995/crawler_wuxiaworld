const { bookshelf } = require('./base');

const Term = bookshelf.Model.extend( {
	tableName: gConfig.tables.term,
	idAttribute: 'term_id'
});

module.exports = Term;
