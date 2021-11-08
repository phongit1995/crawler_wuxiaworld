const knex = require('knex')({
	client: 'mysql',
	connection: gConfig.database
});
const bookshelf = require('bookshelf')(knex);

module.exports = {
	bookshelf,
	knex
};
