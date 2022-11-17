(function() {
    const socket = io()
    const crypt = new JSEncrypt({
        default_key_size: 512
    })

    var publicKey = ""
    var privateKey = ""

    var rooms = {
        self: {}
    }
    var currentlySelected = ""

    const chat = document.getElementById("chat")
    const roomJoinButton = document.getElementById("room-join")
    const chatbox = document.getElementById("chatbox")
    const roomHolder = document.getElementById("room-holder")

    function refreshView(justUpdated = null) {
        chat.innerHTML = "";
        roomHolder.innerHTML = "";

        for (let i = 0; i < Object.keys(rooms).length; i++) {
            const room = Object.keys(rooms)[i]

            const holder = document.createElement("div")
            holder.classList.add("element")
            holder.id = room

            holder.addEventListener("click", () => {
                if (holder.id != 'self') switchTo(holder.id)
            })
            
            const roomNameDiv = document.createElement("div")
            roomNameDiv.classList.add("center")

            roomNameDiv.innerHTML = DOMPurify.sanitize(room == 'self'? "Self: " + socket.id : room)

            if (room == 'self') {
                roomNameDiv.style.fontSize = '12px'
            }

            if (justUpdated != null && justUpdated != currentlySelected && justUpdated == room) {
                roomNameDiv.style.color = "lightcoral"
                roomNameDiv.innerHTML = "(NEW) " + roomNameDiv.innerHTML
            }

            holder.appendChild(roomNameDiv)
            roomHolder.appendChild(holder)
        }

        if (currentlySelected.length < 1) return;

        document.getElementById(currentlySelected).style.backgroundColor = "rgb(100, 100, 100)"

        for (let i = 0; i < rooms[currentlySelected].messages.length; i++) {
            const message = rooms[currentlySelected].messages[i]

            const msgHolder = document.createElement("div")

            const msgDiv = document.createElement("div")
            const fromDiv = document.createElement("i")

            msgHolder.classList.add("element")

            fromDiv.style.fontSize = "12px"

            const decrypt = new JSEncrypt();
            decrypt.setPrivateKey(privateKey);

            const sanitizedMessage = DOMPurify.sanitize((message.from == socket.id? message.message : decrypt.decrypt(message.message)))
            
            if (sanitizedMessage.length < 1) continue;

            fromDiv.innerHTML = message.from;
            msgDiv.innerHTML = sanitizedMessage;

            msgHolder.appendChild(fromDiv)
            msgHolder.appendChild(msgDiv)

            chat.appendChild(msgHolder)
        }

        chat.scrollTo(0, chat.scrollHeight)
    }

    function switchTo(roomID) {
        currentlySelected = roomID
        refreshView()
    }

    chatbox.addEventListener("keydown", (e) => {
        if (currentlySelected.length < 1) {
            return;
        }

        if (e.key == "Enter") {
            const encrypt = new JSEncrypt();
            encrypt.setPublicKey(rooms[currentlySelected].publicKey)
            
            socket.emit("message", {
                message: encrypt.encrypt(chatbox.value),
                target: currentlySelected
            })

            rooms[currentlySelected].messages.push({
                message: chatbox.value,
                from: socket.id
            })

            refreshView()
            chatbox.value = "";
        }
    })

    document.addEventListener("keydown", (e) => {
        chatbox.focus()
    })

    roomJoinButton.addEventListener("click", (e) => {
        const id = prompt("Room ID to join")
        socket.emit("join", id)
        currentlySelected = id
    })

    socket.on("connect", () => {
        socket.emit("publickey", {
            key: publicKey
        })

        refreshView()
    })

    socket.on("join", (msg) => {
        if (!rooms[msg.target]) {
            rooms[msg.target] = {
                messages: [],
                publicKey: "", 
                sockets: msg.sockets
            }
        } else {
            rooms[msg.target].sockets = msg.sockets;
        }

        refreshView()
    })

    socket.on("message", (msg) => {
        rooms[msg.target].messages.push({
            message: msg.message,
            from: msg.from
        })
        refreshView(msg.target)
    })

    socket.on("ack", (msg) => {
        switch (msg) {
            case 'send-key':
                break;
        }
    })

    socket.on("publickey", (msg) => {
        rooms[msg.target].publicKey = msg.key
        refreshView()
    })

    crypt.getKey()

    publicKey = crypt.getPublicKey()
    privateKey = crypt.getPrivateKey()
})()