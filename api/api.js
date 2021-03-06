import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import compression from 'compression'
import methodOverride from 'method-override'
import PrettyError from 'pretty-error'
import http from 'http'
import SocketIo from 'socket.io'
import { mapUrl } from './utils/url'
import * as actions from './actions/index'
import config from '../src/config'

const pretty = new PrettyError()
const app = express()

const server = new http.Server(app)

const io = new SocketIo(server)
io.path('/ws')

app.use(bodyParser.json({ limit: '4mb' }))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(compression())

app.use(methodOverride())

const processActions = (req, res) => {
  const splittedUrlPath = req.url.split('?')[0].split('/').slice(1)

  const { action, params } = mapUrl(actions, splittedUrlPath)

  if (action) {
    action(req, params)
      .then(result => {
        if (result instanceof Function) {
          result(res)
        } else {
          res.json(result)
        }
      }, reason => {
        if (reason && reason.redirect) {
          res.redirect(reason.redirect)
        } else {
          console.error('API ERROR:', pretty.render(reason))
          res.status(reason.status || 500).json(reason)
        }
      })
  } else {
    res.status(404).end('NOT FOUND')
  }
}

app.use(processActions)

const bufferSize = 100
const messageBuffer = new Array(bufferSize)
let messageIndex = 0
if (config.apiPort) {
  const runnable = app.listen(config.apiPort, err => {
    if (err) {
      console.error(err)
    }
    console.log('----\n==> 🌎  API is running on port %s', config.apiPort)
    console.log('==> 💻  Send requests to http://%s:%s', config.apiHost, config.apiPort)
  })

  io.on('connection', socket => {
    socket.emit('news', { msg: '\'Hello World!\' from server' })

    socket.on('history', () => {
      for (let index = 0; index < bufferSize; index += 1) {
        const msgNo = (messageIndex + index) % bufferSize
        const msg = messageBuffer[msgNo]
        if (msg) {
          socket.emit('msg', msg)
        }
      }
    })

    socket.on('msg', data => {
      data.id = messageIndex
      messageBuffer[messageIndex % bufferSize] = data
      messageIndex += 1
      io.emit('msg', data)
    })
  })
  io.listen(runnable)
} else {
  console.error('==>     ERROR: No PORT environment variable has been specified')
}
