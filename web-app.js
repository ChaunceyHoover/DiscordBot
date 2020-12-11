// Web app
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

// Start web app
const server = express();
const port = process.env.PORT || 80;

// Set view engine to pug
server.set('views', path.join(__dirname, 'views'));
server.set('view engine', 'pug');

// Set root directory for web server
server.use(express.static(path.join(__dirname, 'wwwroot')));

// Process requests as JSON
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: false }));

// Process URLs
server.use(require('./routes/index')); // allows for custom URLs & removal of file extensions
server.use('/api', require('./routes/api')); // maps all API calls to /api/*

server.listen(port);
console.log(`Successfully started web app on port ${port}`);