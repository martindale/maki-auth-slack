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

This library adds (or extends) two new resources to a Maki application,  The `Session` and `Authentication` resources.

**Sessions** are interactable objects that utilize cookies to maintain a logged-in status on behalf of a user.  Sessions are automatically created for authenticated users, and the user can subsequently log out by issuing a `DELETE` request to their corresponding session:

```
DELETE /sessions/060735ade...
> 204 No Content
```

The user has now been logged out.

Users can retrieve their own session ID by requesting `/sessions` from the server, which will provide an array of known sessions for the currently authenticated user.

**Authentications** are a special resource that provide paths that will direct a desiring user to the appropriate locations when using the HTTP service (enabled by default for Maki applications).  This plugin adds the `/authentications/slack` path, which sends the user through the OAuth flow.
