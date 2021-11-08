const { knex } = require('./base');
const Post = require('./post');
const PostMeta = require('./post_meta');
const Chapter = require('./chapter');
const ChapterData = require('./chapter_data');
const TermRelationship = require('./term_relationship');
const Option = require('./option');
const Term = require('./term');
const TermTaxonomy = require('./term_taxonomy');

module.exports = {
	Post,
	PostMeta,
	Chapter,
	ChapterData,
	TermRelationship,
	Option,
	Term,
	TermTaxonomy,
	knex
};
