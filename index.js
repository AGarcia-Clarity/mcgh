require('dotenv').config()
const querystring = require('querystring')
const axios = require('axios')
const { router, get } = require('microrouter');
const redirect = require('micro-redirect');
const uid = require('uid-promise');
const { send } = require('micro');
const origin = process.env.NODE_ENV === 'development'
  ? 'http://localhost:8000'
  : 'http://tud.vfs.va.gov'
const cors = require('micro-cors')({ 
  allowMethods: ['GET'],
  origin
})

const githubUrl = 'github.com'

const states = [];

const redirectWithQueryString = (res, data) => {
  const location = `${process.env.REDIRECT_URL}?${querystring.stringify(data)}`
  redirect(res, 302, location)
}

const status = async (_, res) => {
  send(res, 200, { status: 'ok'})
}

const login = async (req, res) => {
  if(req.headers.referer !== origin) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }
  const state = await uid(20);
  states.push(state);
  const { scope, allow_signup } = req.query;
  const query = {
    client_id: process.env.CLIENT_ID,
    state
  };
  if (scope) query.scope = scope;
  if (allow_signup !== undefined) query.allow_signup = allow_signup;
  redirect(res, 302, `https://${githubUrl}/login/oauth/authorize?${querystring.stringify(query)}`);
};

const callback = async (req, res) => {
  if(req.headers.referer !== origin) {
    send(res, 401, { error: 'Unauthorized' });
    return;
  }
  res.setHeader('Content-Type', 'text/html')
  const { code, state } = req.query

  if (!code && !state) {
    redirectWithQueryString(res, { error: 'Provide code and state query param' })
  } else if (!states.includes(state)) {
    redirectWithQueryString(res, { error: 'Unknown state' })
  } else {
    states.splice(states.indexOf(state), 1);
    try {
      const { status, data } = await axios({
        method: 'POST',
        url: `https://${githubUrl}/login/oauth/access_token`,
        responseType: 'json',
        data: {
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          code
        }
      })

      if (status === 200) {
        const qs = querystring.parse(data)
        if (qs.error) {
          redirectWithQueryString(res, { error: qs.error_description })
        } else {
          redirectWithQueryString(res, { access_token: qs.access_token })
        }
      } else {
        redirectWithQueryString(res, { error: 'GitHub server error.' })
      }
    } catch (err) {
      redirectWithQueryString(res, { error: 'Please provide CLIENT_ID and CLIENT_SECRET as environment variables. (or GitHub might be down)' })
    }
  }
}

module.exports = router(
  get('/status', status),
  get('/login', cors(login)),
  get('/callback', callback)
);