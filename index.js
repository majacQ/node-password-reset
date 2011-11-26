var mailer = require('mailer');
var url = require('url');
var EventEmitter = require('events').EventEmitter;

module.exports = function (opts) {
    if (typeof opts === 'string') {
        opts = { uri : opts };
    }
    
    var reset = new Forgot(opts);
    
    var self = function (email, cb) {
        var session = reset.generate();
        if (!session) return;
        
        var uri = session.uri = opts.uri + '?' + session.id;
        
        var body = opts.body
            ? opts.body(uri, email)
            : 'Please click this link to reset your password:\r\n' + uri
        ;
        
        var msg = {
            host : opts.host || 'localhost',
            domain : opts.domain || 'localhost',
            port : opts.port || 25,
            to : [ email ],
            from : opts.from || 'password-robot@localhost',
            subject : opts.subject || 'password reset confirmation',
            body : body,
        };
        [ 'ssl', 'authentication', 'username', 'password' ]
            .forEach(function (name) {
                if (opts[name] !== undefined) msg[name] = opts[name];
            })
        ;
        mailer.send(msg, function (err) {
            if (err) {
                if (cb) cb(err);
                session.emit('failure', err);
                delete reset.sessions[session.id];
            }
            else {
                if (cb) cb(null);
                session.emit('success');
            }
        });
        
        return session;
    };
    
    self.middleware = reset.middleware.bind(reset);
    return self;
};

function Forgot (opts) {
    this.sessions = opts.sessions || {};
    this.mount = url.parse(opts.uri);
}

Forgot.prototype.generate = function () {
    var buf = new Buffer(64);
    for (var i = 0; i < buf.length; i++) {
        buf[i] = Math.floor(Math.random() * 256);
    }
    var id = buf.toString('base64');
    
    var session = this.sessions[id] = new EventEmitter;
    session.id = id;
    return session;
};

Forgot.prototype.middleware = function (req, res, next) {
    if (!next) next = function (err) {
        if (err) res.end(err)
    }
    
    var u = url.parse(req.url);
    var id = u.query;
    
    if (req.headers.host !== this.mount.host
    || u.pathname !== this.mount.pathname) {
        next()
    }
    else if (!id) {
        res.statusCode = 400;
        next('No auth token specified.');
    }
    else if (!this.sessions[id]) {
        res.statusCode = 410;
        next('auth token expired');
    }
    else {
        this.sessions[id].emit('request', req, res);
    }
};