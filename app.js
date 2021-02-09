// import client whatsapp
const { Client } = require('whatsapp-web.js');
// imoprt express
const express = require('express');
// import express validator
const { body, validationResult } = require('express-validator');
// import authentication
const session = require('express-session')
// import socket io untuk komunikasi
const socketIO = require('socket.io');
// import qrcode untuk merubabh string to qr
const qrcode = require('qrcode');
// import http
const http = require('http');
const fs = require('fs');

// import number cleaner
const { phoneFormatter } = require('./helpers/formatter');
const port = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
// var bodyParser = require('body-parser')//add this
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

// init session
app.use(session({
  secret: 'a98vop&^APO(WSdrvca68s0d9BGA*DA)*WVV$%W6()*&@%$$#asd',
  saveUninitialized: true,
  resave: false
}))

// custom api key

const apiKey = "isb-214-v0-as876c-asove7";


// session whatsapp
const SESSION_FILE_PATH = './wa-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}



// make all the files in 'public' available
// https://expressjs.com/en/starter/static-files.html
app.use(express.static("public"));

// https://expressjs.com/en/starter/basic-routing.html
app.get("/", (req, res) => {
  if (req.session.auth) {
    res.redirect('/redirects')
  }
  res.sendFile(__dirname + "/views/login.html");
});

app.post('/', (req, res) => {
  if (req.body.username == "admin") {
    if (req.body.password == "123") {
      req.session.auth = true;
      res.redirect('/redirects')
    } else {
      io.emit('wrong', 'Password');
    }
  } else {
    io.emit('wrong', 'Username');
  }

})

app.get('/redirects', (req, res) => {
  if (req.session.auth) {
    res.redirect('/dashboard')
  } else {
    res.redirect('/')
  }
})



app.get("/dashboard", (req, res) => {

  // jika session ada
  if (req.session.auth) {
    // ambil session
    return res.sendFile(__dirname + "/views/dashboard.html");
  }

  // jika tidak ada session maka redirect ke /
  res.redirect('/');

});

app.get("/scan-qr", (req, res) => {

  // jika session ada
  if (req.session.auth) {
    // ambil session
    return res.sendFile(__dirname + "/views/scan.html");

  }

  // jika tidak ada session maka redirect ke /
  res.redirect('/');

});



const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    // executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // <- this one doesn't works in Windows
      '--disable-gpu'
    ],
  },
  session: sessionCfg
});

// jika ingin menambahkan automasi
client.on('message', msg => {
  if (msg.body == '!ping') {
    msg.reply('pong');
  }
});

client.initialize();

// Socket IO
io.on('connection', function (socket) {
  socket.emit('connector');
  socket.emit('logs', 'Connect to Whatsapp');
  socket.emit('logs', 'Menunggu QR Code. mungkin membutuhkan banyak waktu!');
  socket.emit('apiKey', apiKey)



  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('logs', 'QR Code received, scan please!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp is ready!');
    socket.emit('logs', 'Whatsapp is ready!');
  });

  client.on('authenticated', (session) => {
    socket.emit('logs', 'Whatsapp is authenticated!');
    console.log('AUTHENTICATED', session);
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on('auth_failure', function (session) {
    socket.emit('logs', 'Auth failure, restarting...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('logs', 'Whatsapp is disconnected!');
    fs.unlinkSync(SESSION_FILE_PATH, function (err) {
      if (err) return console.log(err);
      console.log('Session file deleted!');
      socket.emit('logs', 'Session file deleted. Plase scan angain');
    });
    client.destroy();
    client.initialize();
  });


  socket.on('deleteSesi', () => {
    if (fs.existsSync(SESSION_FILE_PATH)) {
      fs.unlinkSync(SESSION_FILE_PATH, function (err) {
        if (err) return console.log(err);
        console.log('Session file deleted!');
        socket.emit('logs', 'Session file deleted. Plase scan angain');
      });
      socket.emit('status', {
        title: 'Yey...',
        msg: 'Kamu tidak memiliki sesi untuk di hapus!',
        icon: 'success'
      });
      client.destroy();
      client.initialize();
      socket.emit('logs', 'initialize berhasil! silahkan tunggu mungkin agak lama!');
    } else {
      socket.emit('status', {
        title: 'Whoops...',
        icon: 'warning',
        msg: 'Kamu tidak memiliki sesi untuk di hapus!'
      })
    }
  })
});


const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}




// Send message @post
app.post('/api/send', [
  body('number').notEmpty(),
  body('message').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }
  if (typeof req.query.key == 'undefined') {
    return res.status(422).json({
      status: false,
      message: 'Membutuhkan parameter key.'
    });
  }

  if (req.query.key !== apiKey) {
    return res.status(422).json({
      status: false,
      message: 'API Key salah!'
    });
  }

  const number = phoneFormatter(req.body.number);
  const message = req.body.message;


  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'Nomer target tidak terdaftar'
    });
  }

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});


// send message @get
app.get('/api/send', async (req, res) => {

  if (typeof req.query.number == 'undefined') {
    return res.status(422).json({
      status: false,
      message: 'parameter number perlu diisi. /api/send?number=[nomer target]&msg=[pesan]'
    });
  } else

    if (typeof req.query.msg == 'undefined') {
      return res.status(422).json({
        status: false,
        message: 'parameter msg perlu diisi. /api/send?number=[nomer target]&msg=[pesan]'
      });
    }


  if (typeof req.query.key == 'undefined') {
    return res.status(422).json({
      status: false,
      message: 'Membutuhkan parameter key.'
    });
  }

  if (req.query.key !== apiKey) {
    return res.status(422).json({
      status: false,
      message: 'API Key salah!'
    });
  }


  const number = phoneFormatter(req.query.number);
  const message = req.query.msg;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'Nomer target tidak terdaftar'
    });
  }


  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });
});

server.listen(port, function () {
  console.log('App running on *: ' + port);
});
