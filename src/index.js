const express = require('express')
const dotenv = require('dotenv')
const fs = require('fs')
const cookieParser = require('cookie-parser')
const clc = require('cli-color')
const readline = require("readline");
const compression = require('compression')
const { createServer } = require("http");
const { Server } = require("socket.io");
const { instrument } = require("@socket.io/admin-ui")

dotenv.config()

const PORT = parseInt(process.env.PORT) || 8080
const DEBUG = process.env.DEBUG == null? true : (process.env.DEBUG == "1")
const INIT_ARGS = process.argv.slice(2);
const MAX_ROOM_NAME_SIZE = process.env.MAX_ROOM_NAME_SIZE || 16

const app = express()
const httpServer = createServer(app);
const io = new Server(httpServer);
instrument(io, {
    auth: {
        type: "basic",
        username: process.env.ADMIN_USERNAME || "admin",
        password: process.env.ADMIN_PASS || "$2b$10$MpvhUG3v5/JOn/aro9TnBuRB8HYR/5nSVqTL1ZOyjoUJhJPyqeBZK" // "admin"
    }
})

// ===== Console Log Inject =====

function getLogPrefix() {
    return new Date().getDate() + '.' + new Date().getMonth() + '.' + new Date().getFullYear() + ' / ' + new Date().getHours() + ':' + new Date().getMinutes() + ':' + new Date().getSeconds();
}

const _oldConsoleLog = console.log
const _oldConsoleWarn = console.warn
const _oldConsoleError = console.error

console.log = function() {  
    let args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.blue.bold("[I]"));
    
    _oldConsoleLog.apply(console, args);
}

console.warn = function() {  
    let args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.yellow.bold("[W]"));

    for (let i = 1; i < args.length; i++) {
        args[i] = clc.yellow(args[i])
    }
    
    _oldConsoleWarn.apply(console, args);
}

console.error = function() {  
    let args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.red.bold("[E]"));

    for (let i = 1; i < args.length; i++) {
        args[i] = clc.red(args[i])
    }
    
    _oldConsoleError.apply(console, args);
}

// ==============================

let userData = {}

if (!fs.existsSync("data/")) {
    fs.mkdirSync("data")
    console.warn("No old data folder found, creating new...")
}

if (fs.existsSync('data/userData.json')) {
    userData = JSON.parse(fs.readFileSync('data/userData.json').toString('utf-8'))
} else {
    fs.writeFileSync('data/userData.json', "{}")
    console.warn("No old userdata.json file found, creating new...")
}

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', 'src/public/html');

app.use(cookieParser())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(compression())

app.use(express.static("src/public/css"))

app.get("/", (req, res) => {
    res.render('index')
})

app.get("/index.js", (req, res) => {
    res.sendFile(__dirname + "/public/javascript/index.js")
})

app.get("/jsencrypt/jsencrypt.min.js", (req, res) => {
    res.sendFile(__dirname + "/public/javascript/jsencrypt.min.js")
})

app.use((req, res, next) => {
    res.status(404).send("404 | Not Found")
})

httpServer.listen(PORT, () => {
    console.log("WebServer listening on port " + PORT)
})

io.on("connection", (socket) => {
    console.log("User Connection | ID: " + socket.id)

    socket.on("join", async (msg) => {
        if (socket.rooms.has(msg)) {
            socket.emit("error", "You're already part of that room")
            return;
        }

        if (msg.length > MAX_ROOM_NAME_SIZE) {
            socket.emit("error", "Room name too long")
            return;
        }

        const sockets = await io.in(msg).fetchSockets()
        if (sockets.length > 1) {
            socket.emit("error", "Room full")
            return;
        }

        socket.join(msg)
        io.to(msg).emit("join", {
            target: msg,
            user: socket.id,
            sockets: sockets.map(x => x.id)
        })

        if (sockets.length > 0) {
            socket.emit("publickey", {
                target: msg,
                key: sockets.at(0).data.key
            })
            sockets.at(0).emit("publickey", {
                target: msg,
                key: socket.data.key
            })
        }
    })

    socket.on("leave", (msg) => {
        if (!socket.rooms.has(msg)) {
            socket.emit("error", "You aren't part of that room")
            return;
        }

        socket.leave(msg)
        io.to(msg).emit("leave", {
            target: msg,
            user: socket.id
        })
    })

    socket.on("publickey", (msg) => {
        if (typeof msg != 'object') {
            socket.emit("error", "Expected object, got string")
            return;
        }

        if (!msg.key) {
            socket.emit("error", "Missing argument(s). Expected key")
            return;
        }

        socket.data.key = msg.key;
    })

    socket.on("message", (msg) => {
        if (typeof msg != 'object') {
            socket.emit("error", "Expected object, got string")
            return;
        }

        if (!msg.message || !msg.target) {
            socket.emit("error", "Missing argument(s). Expected message, target")
            return;
        }

        if (!socket.rooms.has(msg.target)) {
            socket.emit("error", "Not connected to room")
            return;
        }

        socket.to(msg.target).emit("message", {
            target: msg.target,
            message: msg.message,
            from: socket.id
        })
    })

    socket.on("disconnect", (reason) => {
        
        console.log("User Disconnect | Reason: " + reason + " | ID: " + socket.id)
    })
})

if (DEBUG) {
    console.warn("Debug mode is enabled! Disable it by adding \"DEBUG=0\" in \".env\".")

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    
    rl.on("line", (input) => {
        const command = input.split(" ")[0]
        const args = input.split(" ").slice(1)

        switch (command) {
            case "echo":
                console.log(args.join())
                break;
            case "stop":
                console.log("Closing down listeners")
                rl.close()
                console.log("Saving all files")
                fs.writeFileSync("data/userData.json", JSON.stringify(userData));
                console.log("Shutting down WebSocket connections")
                console.log("Shutting down Express server")
                console.log("Shutdown process completed.")
                process.exit()
            default:
                console.error("Not a valid command. Commands: [stop]")
        }
    })
}

if (INIT_ARGS.includes("CI")) {
    process.exit(0);
}