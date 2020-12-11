const router = require('express').Router();
//const { readConfig } = require('../lib/config');

router.get('/test', function(req, res, next) {
	res.sendStatus(418);
});

module.exports = router;