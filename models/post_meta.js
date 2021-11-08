const { bookshelf } = require('./base');

const PostMeta = bookshelf.Model.extend( {
	tableName: gConfig.tables.post_meta,
	idAttribute: 'meta_id'
});

PostMeta.createMeta = function(postId, data = {}){
	let postMetaList = Object.keys(data).map((key)=>{
		let pid = (key === '_wp_attached_file' || key === '_wp_attachment_metadata') ? data._thumbnail_id : postId;
		return new PostMeta({post_id: pid, meta_key: key}).fetch().catch(function () {
			return new PostMeta({
				post_id: pid,
				meta_key: key,
				meta_value: data[key]
			}).save(null, {method: 'insert'})
		});
	});
	return Promise.all(postMetaList);
};

PostMeta.updateModified = function (postId) {
	let dateGMT = momentGMT0().unix();
	let data = {
		'_edit_lock': dateGMT,
		'_latest_update': dateGMT,
		'_edit_last': 1
	};
	let postMetaList = Object.keys(data).map((key) => {
		return new PostMeta({post_id: postId, meta_key: key})
			.fetch()
			.then(function (postMetaModel) {
				postMetaModel.set('meta_value', data[key]);
				postMetaModel.save();
			})
			.catch(function () {
				return new PostMeta({
					post_id: postId,
					meta_key: key,
					meta_value: data[key]
				}).save(null, {method: 'insert'})
			});
	});
	return Promise.all(postMetaList);
};

module.exports = PostMeta;
