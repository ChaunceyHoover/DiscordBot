const router = require('express').Router();
//const { readConfig } = require('../lib/config');

router.get('/', function(req, res, next) {
	res.render('index', {title: "Home"});
});

module.exports = router;