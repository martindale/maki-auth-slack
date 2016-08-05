var async = require('async');
var SlackStrategy = require('passport-slack').Strategy;

/**
 * The primary plugin object.
 * @constructor
 * @param {Object} config A monolithic configuration object.
 * @param {String} config.resource The name of the Resource that will be extended by this plugin.
 * @param {Object} config.slack Slack-specific configuration object.
 * @param {String} config.slack.id Application ID from Slack.
 * @param {String} config.slack.secret Application secret from Slack.
 * @param {String} config.slack.callback Callback URI for Slack's OAuth flow.
 * @param {String} [config.slack.team] Team ID to restrict authentication to.
 * @param {Object} [config.fields] A map of the field names for the plugin.
 * @param {String} [config.fields.username] Name of the property on the extended resource to select as the resource's name.  Used for all references to singular instances of this resource.
 */
function AuthSlack(config) {
  if (!config) var config = {};
  if (!config.fields) config.fields = {};

  var self = this;
  self.config = config;

  config.fields.username = config.fields.username || 'username';

  var resources = {};
  if (self.config.resource) {
    // TODO: modularize this so it can be re-used
    // probably place it in a shared Resource defition, "Identity" (?)
    resources[ self.config.resource ] = {
      //plugin: passportLocalMongoose,
      plugin: function (schema, options) {
        schema.add({ id: String });
        schema.pre('save', function (next) {
          var self = this;
          if (!self.id) self.id = self.slug || self.username;
          next();
        });
      }
    };
  }

  self.extends = {
    resources: resources,
    services: {
      http: {
        middleware: function (req, res, next) {
          // TODO: modularize this so it can be re-used
          // probably place it in a shared Resource defition, "Session"
          var stack = [];
          if (!req.session.hash) {
            stack.push(function(done) {
              req.session.hash = require('crypto').createHash('sha256').update( req.session.id ).digest('hex');
              req.session.save( done );
            });
          }
          async.series( stack , function (err, results) {
            req.user = req.session.user;
            // set a user context (from passport)
            res.locals.user = req.session.user;
            res.locals.session = req.session;
            req.identity = req.user;
            return next();
          });
        },
        setup: function( maki ) {
          // TODO: modularize this so it can be re-used
          if (!maki.passport) {
            console.warn('[WARNING]', 'No passport configured!  Attaching...');
            
            var fs = require('fs');
            var passport = require('passport');
            
            // session handling
            var levelStore = require('level-session-store');
            var session = require('express-session');
            var cookieParser = require('cookie-parser');
            var methodOverrides = require('maki-forms');

            var flash = require('connect-flash');
            
            maki.passport = passport;

            var LevelStore = levelStore( session );

            if (!fs.existsSync(process.env.PWD + '/data')) fs.mkdirSync(process.env.PWD + '/data');
            if (!fs.existsSync(process.env.PWD + '/data/sessions')) fs.mkdirSync(process.env.PWD + '/data/sessions');

            maki.app.use( methodOverrides );
            maki.app.use( cookieParser( maki.config.sessions.secret ) );

            maki.app.use( session({
              name: maki.config.service.namespace + '.id',
              store: new LevelStore( process.env.PWD + '/data/sessions'),
              secret: maki.config.sessions.secret,
              cookie: {
                //secure: true,
                maxAge: 30 * 24 * 60 * 60 * 1000
              },
              rolling: true
            }));

            /* Configure the registration and login system */
            maki.app.use( maki.passport.initialize() );
            maki.app.use( maki.passport.session() );
            maki.app.use( flash() );
            maki.app.use(function(req, res, next) {
              res.format({
                html: function() {
                  res.locals.messages = {
                    info: req.flash('info'),
                    warning: req.flash('warning'),
                    error: req.flash('error'),
                    success: req.flash('success'),
                  };
                  next();
                },
                default: function() {
                  next();
                }
              });

            });
            
            maki.app.use(function(req, res, next) {
              maki.resources[self.config.resource].count({
                status: 'active'
              }, function(err, count) {
                if (err) console.error(err);
                res.locals.online = count || 0;
                next();
              });
            });
            
          }

          var strategy = new SlackStrategy({
            passReqToCallback: true,
            clientID: self.config.slack.id,
            clientSecret: self.config.slack.secret,
            callbackURL: self.config.slack.callback,
            scope: 'users:read'
          }, self.config.slack.verifyUser || verifyUser);
          
          maki.passport.use(strategy);
          
          function verifyUser (req, accessToken, refreshToken, profile, done) {
            if (self.config.slack.team && self.config.slack.team !== profile._json.team_id) {
              return done('Wrong team.');
            }

            var Resource = maki.resources[ self.config.resource ];
            
            Resource.get({
              'links.slack': profile.id
            }, function(err, user) {
              if (err) return done(err);
              if (user) {
                req.user = user;
                req.session.user = user;
                req.session.identity = user;
                return req.session.save(function() {
                  return done( null , user );
                });
              }

              var query = {
                '$or': [
                  { 'id': profile.displayName },
                  { 'username': profile.displayName }
                ]
              };

              Resource.get(query, function(err, similarUser) {
                if (err) return done(err);

                if (!similarUser) {
                  Resource.create({
                    id: profile.displayName,
                    username: profile.displayName,
                    links: {
                      slack: profile.id
                    }
                  }, function(err, createdUser) {
                    if (err) return done(err);
                    req.session.user = createdUser;
                    req.session.save(function(err) {
                      if (err) return done(err);
                      done(null, createdUser);
                    });
                  });
                } else {
                  Resource.patch({
                    id: similarUser.id
                  }, [
                    { op: 'add', path: '/links/slack', value: profile.id }
                  ], function(err, num) {
                    if (err) return done(err);
                    req.session.user = similarUser;
                    req.session.save(function(err) {
                      if (err) return done(err);
                      return done(null, similarUser);
                    });
                  });
                }
              });
            });
          }

          // Stubs for session management
          /* BEGIN STUBS */
          maki.app.get('/authentications/slack', maki.passport.authorize('slack'));
          maki.app.get('/authentications/slack/callback', maki.passport.authorize('slack'), function(req, res, next) {
            res.redirect('/');
          });
          /* END STUBS */

          // Stubs for session management
          /* BEGIN STUBS */
          maki.app.get('/sessions', function(req, res, next) {
            res.format({
              json: function() {
                res.send([req.session]);
              },
              /*html: function() {
                res.redirect('/');
              }*/
            });
          });
          
          maki.app.delete('/sessions/:sessionID', function(req, res, next) {
            req.session.destroy(function() {
              res.format({
                json: function() {
                  res.status(204).end();
                },
                html: function() {
                  res.redirect('/');
                }
              });
            });
          });
          /* END STUBS */

          // TODO: modularize these and re-use it across other auth plugins
          maki.passport.serializeUser(function(user, done) {
            console.log('serializing:', user);
            done( null , user.id );
          });
          maki.passport.deserializeUser(function(id, done) {
            console.log('deserializing:', id);
            maki.resources[ self.config.resource ].get({ id: id }, done );
          });

        }
      }
    }
  };

  return self;
}

module.exports = AuthSlack;
