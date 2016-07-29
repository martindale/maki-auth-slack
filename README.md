# maki-auth-slack
Authenticate against a Maki-powered service using Slack.

## Quick Start
Get an [application ID and Secret from Slack][slack-apps].

Plug in to a Maki application:

```js
var config = require('./config');

var Maki = require('maki');
var exampleApp = new Maki(config);

var Auth = require('maki-auth-slack');
var auth = new Auth({
  resource: 'Person',
  slack: config.auth.slack
});

exampleApp.use(auth);

exampleApp.define('Person', {
  attributes: {
    username: { type: String }
  }
});

exampleApp.start();
```

Your config should be extended with the following object:

```js
{
  auth: {
    slack: {
      id: 'your app id',
      secret: 'your app secret',
      callback: 'your application callback URI'
    }
  }
}

```

[slack-apps]: https://api.slack.com/apps
