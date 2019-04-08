const circle_metadata = {
    type: 'xviz/metadata',
    data: {
        version: '2.0.0',
        streams: {
            ['/vehicle_pose']: {},
            ['/circle']: {
                coordinate: 'IDENTITY',
                stream_style: {
                    fill_color: [200, 0, 70, 120]
                }
            },
            ['/ground_grid_h']: {
                coordinate: 'IDENTITY',
                stream_style: {
                    stroked: true,
                    stroke_width: 0.2,
                    stroke_color: [0, 255, 0, 128]
                }
            },
            ['/ground_grid_v']: {
                coordinate: 'IDENTITY',
                stream_style: {
                    stroked: true,
                    stroke_width: 0.2,
                    stroke_color: [0, 255, 0, 128]
                }
            }
        }
    }
};

// Special metadata for the non-live test case
const circle_log_metadata = JSON.parse(JSON.stringify(circle_metadata));
circle_log_metadata.data.log_info = {
    log_start_time: 1000,
    log_end_time: 1030
};

class CircleScenario {
    constructor(ts) {
        // Get starting timestamp
        this.timestamp = ts || Date.now() * 1000;
    }

    getFrame(frameNumber) {
        return this._getFrame(frameNumber);
    }

    _getFrame(frameNumber) {
        const timestamp = this.timestamp + 0.1 * frameNumber;

        return {
            type: 'xviz/state_update',
            data: {
                update_type: 'snapshot',
                updates: [
                    {
                        timestamp,
                        poses: this._drawPose(frameNumber, timestamp),
                        primitives: this._drawGrid()
                    }
                ]
            }
        };
    }

    _drawPose(frameNumber, timestamp) {
        // 6 degrees per frame
    
        const angle = frameNumber * 6 * DEG_1_AS_RAD;
        return {
            '/vehicle_pose': {
                timestamp,
                // Make the car orient the proper direction on the circle
                orientation: [0, 0, DEG_90_AS_RAD + frameNumber  * DEG_6_AS_RAD],
                position: [30 * Math.cos(angle), 30 * Math.sin(angle), 0]
            }
        }
    }

    _drawGrid() {
        const grid = [-40, -30, -20, -10, 0, 10, 20, 30, 40];

        const gridXVIZ_h = grid.map(x => {
            return {
                vertices: [x, -40, 0, x, 40, 0]
            };
        });

        const gridXVIZ_v = grid.map(y => {
            return {
                vertices: [-40, y, 0, 40, y, 0]
            };
        });

        return {
            ['/ground_grid_h']: {
                polylines: gridXVIZ_h
            },
            ['/ground_grid_v']: {
                polylines: gridXVIZ_v
            },
            ['/circle']: {
                circles: [
                    {
                        center: [0.0, 0.0, 0.0],
                        radius: 30.0
                    }
                ]
            }
        };
    }
}

module.exports = {
    circle: {
        metadata: circle_metadata,
        generator: new CircleScenario()
    },
    circle_log: {
        metadata: circle_log_metadata,
        generator: new CircleScenario(circle_log_metadata.data.log_info.log_start_time)
    }
};