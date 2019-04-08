/* eslint-disable camelcase */
const {ArgumentParser} = require('argparse');
const path = require('path');

const parser = new ArgumentParser({
    addHelp : true,
    description: 'Example XVIZ stream server'
});

parser.addArgument(['-d', '--data_directory'], {
    help:
        'Directory to server data from. Relative path will be resolved relative to /data/generated/, and absolute paths directly.'
});

parser.addArgument(['--port'], {
    defaultValue: 8081, 
    help: 'Websocket port to use'
});

parser.addArgument(['--frame_limit'], {
    type: Number,
    help: 'Reduce or extend the number of frames to send'
});

parser.addArgument(['--live'], {
    defaultValue: false,
    action: 'storeTrue',
    help: 'Play forever, jumping to the beginning, after playback is done (timestamps will be fixed)'
});

parser.addArgument(['--skip_images'], {
    defaultValue: false,
    help: 'Will not send vide frames'
});

module.exports = function getArgs() {
    const args = parser.parseArgs();
    if (args.data_directory) {
        if(!args.data_directory.startsWith('/')) {
            args.data_directory = path.resolve(__dirname, '../../data/generated/', args.data_directory);
        }
    }

    return args;
};
