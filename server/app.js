const express = require('express');
const {Client, LocalAuth} = require('whatsapp-web.js');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin : "http://app.leonardogallo.co",  // ou "*" para permitir todas as origens
        methods: ["GET", "POST"]
    }
});


let isConnected = false;

// Configurações do WhatsApp Client
const client = new Client({
                              puppeteer: {
                                  args: ['--no-sandbox', '--disable-setuid-sandbox'],
                              },
                              authStrategy: new LocalAuth(),
                              sessionFile: './session.json'
                          });


// Middleware para servir arquivos estáticos
app.use(express.static('../public'));
app.use(express.json());

// Inicialização do servidor
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});

// Funções auxiliares
async function generateQRCode(qr) {
    try {
        return await QRCode.toDataURL(qr);
    } catch (err) {
        console.error('Erro ao gerar QR Code:', err);
    }
}

// async function getProfilePicture() {
//     try {
//         const wid = client.info.wid.user;
//         return await client.getProfilePicUrl(`${wid}@c.us`);
//     } catch (err) {
//         console.error('Erro ao obter a URL da foto de perfil:', err);
//     }
// }

// Eventos do WhatsApp Client
client.on('qr', async qr => {
    const qrAsDataURL = await generateQRCode(qr);
    io.emit('qr', qrAsDataURL);
});

client.on('ready', async () => {
    console.log('Client Ready')
    isConnected = true;
    const info = client.info;
    io.emit('info', {
        pushname: info.pushname,
        user    : info.wid.user,
        platform: info.platform
    });
    // const profilePicUrl = await getProfilePicture();
    // io.emit('profilePic', profilePicUrl);
});

client.on('authenticated', session => {
    console.log('Autenticado com sucesso!', session);
});

client.on('auth_failure', msg => {
    console.error('Autenticação falhou:', msg);
});

client.on('disconnected', reason => {
    isConnected = false;
    console.log('Cliente foi desconectado:', reason);
});

// Rotas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Eventos do Socket.io
io.on('connection', socket => {
    socket.emit('connectionStatus', isConnected);

    socket.on('enviarMensagem', async ({numero, mensagem}) => {
            await client.sendMessage(`${numero}@c.us`, mensagem);
            console.log(`Mensagem enviada para ${numero}: ${mensagem}`);
    });


    socket.on('desconectarInstancia', async () => {
        try {
            console.log("Recebido pedido para desconectar a instância.");
            await client.destroy();
            fs.unlinkSync('./session.json'); // Remove o arquivo de sessão
            console.log("Instância desconectada e arquivo de sessão removido.");
            socket.emit('desconectado');
        } catch (err) {
            console.error("Erro ao desconectar a instância:", err);
        }
    });

    socket.on('conectarInstancia', async () => {
        try {
            client.initialize();
        } catch (err) {
            console.error('Erro ao conectar:', err);
        }
    });

    socket.on('atualizarInfo', () => {
        if (client.info) {
            socket.emit('info', {
                pushname: client.info.pushname,
                user    : client.info.wid.user,
                platform: client.info.platform
            });
        }
    });
});

// Novo endpoint para enviar mensagens via n8n ou Postman
app.post('/sendMessage', async (req, res) => {
    try {
        const { numero, mensagem } = req.body; // Extrai número e mensagem do corpo da requisição

        if (!numero || !mensagem) {
            return res.status(400).json({ error: 'Número e mensagem são necessários' });
        }

        await client.sendMessage(`${numero}@c.us`, mensagem);
        console.log(`Mensagem enviada para ${numero}: ${mensagem}`);

        res.status(200).json({ success: 'Mensagem enviada com sucesso' });
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});