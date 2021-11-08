const { bookshelf } = require('./base');

const TermRelationship = bookshelf.Model.extend( {
	tableName: gConfig.tables.term_relationship,
	idAttribute: 'object_id'
});

TermRelationship.createObject = function(postId, term_taxonomy_ids = []){
	let hardCodeIds = [
		//390, // wp-manga-release = 2019
		//392, //wp-manga-artist = ToonManga.com
		//394, //wp-manga-tag = ToonManga
		//397, //wp-manga-author = XianYu
	];
	hardCodeIds = [...hardCodeIds, ...gConfig.hardCodeTermRelationship];

	let promiseList  = [...term_taxonomy_ids, ...hardCodeIds].map(ttid => {
		return new TermRelationship({object_id: postId, term_taxonomy_id: ttid}).fetch().catch(function () {
			return new TermRelationship({
				object_id: postId,
				term_taxonomy_id: ttid,
				term_order: 0
			}).save(null, {method: 'insert'});
		});
	});

	return Promise.all(promiseList);
};

module.exports = TermRelationship;
