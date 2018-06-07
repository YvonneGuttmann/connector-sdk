module.exports = (res) =>{
    res.sseSetup = () =>{
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        })
    };

    res.sseSend = (event, data = "") =>{
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        res.flush();
    };
};