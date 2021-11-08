const { bookshelf } = require('./base');

const TermTaxonomy = bookshelf.Model.extend( {
	tableName: gConfig.tables.term_taxonomy,
	idAttribute: 'term_taxonomy_id'
});

module.exports = TermTaxonomy;
