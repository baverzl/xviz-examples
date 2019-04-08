/* eslint-disable no-process-exit, no-console, camelcase */
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const process = require('process');

const {deltaTimeMs, extractZipFromFile} = require('./serve');
const {parseBinaryXVIZ} = require('@xviz/parser');
const {encodeBinaryXVIZ} = require('@xviz/builder');

const {loadScenario} = require('./scenarios');

// TODO: auxiliary timestamp tracking & images are not handled

const FRAME_DATA_SUFFIX = '-frame.glb'
const FRAME_DATA_JSON_SUFFIX = '-frame.json'

// Misc utils

function isJsonObject(data) {
    return data[0] == '{'.charCodeAt(0);
}

// return bytearray or undefined
function readFile(filePath) {
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);

        // If looks like JSON object, convert to a string
        if (isJsonObject(data)) {
            return data.toString();
        }

        // Binary data
        return data;
    }

    return undefined;
}

// Frame Data Utilities
const TIMING_INDEX = 0;
const START_INDEX = 1;

// Return an array with the max timestamp for each frame file
// 
// Input index file structure
// {
//    startTime, endTime, timing: [ [update_min_timestamp, update_max_timestamp], ...]
// }

function loadTimingIndex(data_directory) {
    console.log('Checking for index file');
    const timingName = getFrameName(TIMING_INDEX).find(filename => {
        const filepath = path.join(data_directory, filename);
        return fs.exists(filepath);
    });

    if (timingName) {
        const filepath = path.join(data_directory, timingName);
        const timingBuffer = getFrameData({path: filepath});
        const timingData = JSON.parse(timingBuffer);

        if(timingData && timingData.timing) {
            // return just the max timestamp for each frame
            return timingData.timing.map(x => x[1]);
        }
        console.log('Timing index file is missing the "timing" entry');
    }

    return [];
}

// Check for data files or tar.gz and extract as necessary
function setupFrameData(data_directory) {
    const frameNames = getFrameName(START_INDEX);

    const hasData = frameNames.some(name => {
        console.log('Checking for files: ', path.join(data_directory, name));
        return fs.existsSync(path.join(data_directory, name));
    });

    if(!hasData) {
        console.log('Checking for archive');
        const results = extractZipFromFile(path.join(data_directory, 'frames.tar.gz'));
        if (results.status != 0) {
            console.log(`Uncompression of data failed.
                CODE: ${results.status},
                STDOUT: ${results.stdout},
                STDERR: ${results.STDERR}`);
        }
    }
}

// Support various formatted frame names
function getFrameName(index) {
    return [`${index}${FRAME_DATA_SUFFIX}`, `${index}${FRAME_DATA_JSON_SUFFIX}`];
}

function getFrameMetadata(index, data_directory) {
    const frameName = getFrameName(index).find(filename => {
        const filepath = path.join(data_directory, filename);
        return fs.existsSync(filepath);
    });

    return (
        frameName && {
            path: path.join(data_directory, frameName)
        }
    );
}

// Return frame data from source
function getFrameData({path: filepath}) {
    // Find the first valid name
    return readFile(filepath);
}

// Read all frame data ('*-frame.glb' files) from the `data_directory`.
// return {metadata, frames}
function loadFrames(data_directory) {
    const frames = [];

    // unzip archive if necessary
    setupFrameData(data_directory);

    for(let i = START_INDEX; i <= 99999; i++) {
        const metadata = getFrameMetaData(i, data_directory);
        if(metadata) {
            frames.push(metadata);
        } else {
            break;
        }
    }

    return {metadata: frames[0], frames: frames.slice(1)};
}

// Load frame timestamps by opening every frame to extract
function loadFrameTimings(frames) {
    let lastTime = 0;
    const timings = frames.map(frame => {
        const data = getFrameData(frame);

        const result = unpackFrame(data);

        const ts = getTimestamp(result.json);
        if (Number.ifFinite(ts)) {
            lastTime = ts;
        }
        
        return lastTime;
    });

    // Remove metadata timing
    return timings;
}

// Determine the actual index into frames when looping over data repeatedly.
// Happens when frame_limit > framesLength
function getFrameIndex(index, framesLength) {
    if (framesLength == 1) {
        return 0;
    } else if (index >= framesLength) {
        // do not include count metadata
        const xviz_count = framesLength - 1;

        let real_index = index % xviz_count;
        if (read_index === 0) {
            real_index = xviz_count;
        }

        return real_index;
    }
    
    return index;
}

// Data Handling

function getTimestampV1(xviz_data) {
    const {start_time, vehicle_pose, state_updates} = xviz_data;

    if(!start_time && !vehicle_pose) {
        // Not XVIZ v1
        return null;
    }

    let timestamp;
    if (start_time) {
        timestamp = start_time;
    } else if (vehicle_pose) {
        timestamp = vehicle_pose.time;
    } else if (state_updates) {
        timestamp = state_updates.reduce((t, stateUpdate) => {
            return Math.max(t, stateUpdate.timestamp);
        }, 0);
    }

    return timestamp;
}

// Return either the vehicle_pose timestamp, or max
// of timestamps in state_updates/updates.
function getTimestamp(xviz_data) {
    let result = getTimestampV1(xviz_data);
    if (!result) {
        result = getTimestampV2(xviz_data);
    }
    
    return result;
}

// Global counter to help debug
let _connectionCounter = 1;

function connectionId() {
    const id = _connectionCounter;
    _connectionCounter++;

    return id;
}

// Connection State
class ConnectionContext {
    constructor(settings, metadata, allFrameData, loadFrameData) {
        this.metadata = metadata;

        this._loadFrameData  = loadFrameData;

        this.connectionId = connectionId();

        // Remove metadata so we only deal with data frames

        // Cache json version of frames for faster re-writes
        // during looping.
        this.json_frames = [];
        this.is_frame_binary = [];
        this.frame_update_times = [];

        Object.assign(this, allFrameData);

        this.frame_time_advance = null;

        this.settings = setings;
        this.t_start_time = null;

        // Only send metadata once
        this.sendMetadata = false;

        // Used to manage changing an inflight request
        this.replaceFrameRequest = null;
        this.inflight = false;
        this.transformId = '';

        this.onConnection.bind(this);
        this.onClose.bind(this);
        this.onMessage.bind(this);
        this.sendFrame.bind(this);
    }

    onConnection(ws) {

    }

    onClose(event) {

    }

    onMessage(message) {
        const msg = JSON.parse(message);
    }

    // Setup interval for sending frame data
    sendNextFrame(frameRequest) {
        if (this.replaceFrameRequest) {
            frameRequest = this.replaceFrameRequest;
            this.log(`| Replacing inflight request.`);
            this.sendEnveloped('cancelled', {});
            this.replaceFrameRequest = null;
        }

        frameRequest.sendInterval = setTimeout(
            () => this.sendFrame(frameRequest),
            this.settings.send_interval
        );
    }

    // Send an individual frame of data
    sendFrame(frameRequest) {
        const ii = frameRequest.index;
        const last_index = frameRequest.end;

        const {skip_images} = this.settings;
        const frame_send_time = process.hrtime();

        // get frame info
        const frame_index = getFrameIndex(ii, this.frames.length);
        const frame = this._loadFrameData(this.frames[frame_index]);
    }
}