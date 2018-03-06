// noble-winrt
// Copyright (C) 2017, Uri Shaked
// License: MIT

const { spawn } = require('child_process');
const nativeMessage = require('chrome-native-messaging');
const events = require('events');
const debug = require('debug')('noble-winrt');
const path = require('path');

const BLE_SERVER_EXE = path.resolve(__dirname, 'prebuilt', 'BLEServer.exe');

function toWindowsUuid(uuid) {
    return '{' + uuid + '}';
}

function fromWindowsUuid(uuid) {
    return uuid.replace(/\{|\}/g, '');
}

class WinrtBindings extends events.EventEmitter {
    init() {
        this._deviceMap = {};
        this._requestId = 0;
        this._requests = {};
        this._subscriptions = {};
        this._bleServer = spawn(BLE_SERVER_EXE, ['']);
        this._bleServer.stdout
            .pipe(new nativeMessage.Input())
            .on('data', (data) => {
                this._processMessage(data);
            });
        this._bleServer.stderr.on('data', (data) => {
            console.error('BLEServer:', data);
        });
        this._bleServer.on('close', (code) => {
            this.state = 'poweredOff';
            this.emit('stateChange', this.state);
        });
    }

    startScanning() {
        this._sendMessage({ cmd: 'scan' });
    }

    stopScanning() {
        this._sendMessage({ cmd: 'stopScan' });
    }

    connect(address) {
        this._sendRequest({ cmd: 'connect', 'address': address })
            .then(result => {
                this._deviceMap[address] = result;
                this.emit('connect', address, null);
            })
            .catch(err => this.emit('connect', address, err));
    }

    disconnect(address) {
        this._sendRequest({ cmd: 'disconnect', device: this._deviceMap[address] })
            .then(result => {
                this._deviceMap[address] = null;
                this.emit('disconnect', address, null);
            })
            .catch(err => this.emit('disconnect', address, err));
    }

    discoverServices(address, filters = []) {
        this._sendRequest({ cmd: 'services', device: this._deviceMap[address] })
            .then(result => {
                // TODO filters
                this.emit('servicesDiscover', address, result.map(fromWindowsUuid));
            })
            .catch(err => this.emit('servicesDiscover', address, err));
    }

    discoverCharacteristics(address, service, filters = []) {
        this._sendRequest({
            cmd: 'characteristics',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
        })
            .then(result => {
                // TODO filters
                this.emit('characteristicsDiscover', address, service,
                    result.map(c => ({
                        uuid: fromWindowsUuid(c.uuid),
                        properties: Object.keys(c.properties).filter(p => c.properties[p])
                    })));
            })
            .catch(err => this.emit('characteristicsDiscover', address, service, err));
    }

    read(address, service, characteristic) {
        this._sendRequest({
            cmd: 'read',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
            characteristic: toWindowsUuid(characteristic)
        })
            .then(result => {
                this.emit('read', address, service, characteristic, Buffer.from(result), false);
            })
            .catch(err => this.emit('read', address, service, characteristic, err, false));

    }

    write(address, service, characteristic, data, withoutResponse) {
        // TODO data, withoutResponse
        this._sendRequest({
            cmd: 'write',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
            characteristic: toWindowsUuid(characteristic),
            value: Array.from(data),
        })
            .then(result => {
                this.emit('write', address, service, characteristic);
            })
            .catch(err => this.emit('write', address, service, characteristic, err));
    }

    notify(address, service, characteristic, notify) {
        this._sendRequest({
            cmd: notify ? 'subscribe' : 'unsubscribe',
            device: this._deviceMap[address],
            service: toWindowsUuid(service),
            characteristic: toWindowsUuid(characteristic)
        })
            .then(result => {
                if (notify) {
                    this._subscriptions[result] = { address, service, characteristic };
                } else {
                    // TODO - remove from subscriptions
                }
                this.emit('notify', address, service, characteristic, notify);
            })
            .catch(err => this.emit('notify', address, service, characteristic, err));
    }

    _processMessage(message) {
        debug('in:', message);
        switch (message._type) {
            case 'Start':
                this.state = 'poweredOn';
                this.emit('stateChange', this.state);
                break;

            case 'scanResult':
                let advertisement = {
                    localName: message.localName,
                    txPowerLevel: 0,
                    manufacturerData: null,
                    serviceUuids: message.serviceUuids.map(fromWindowsUuid),
                    serviceData: [],
                };
                this.emit(
                    'discover',
                    message.bluetoothAddress.replace(/:/g, ''),
                    message.bluetoothAddress,
                    'public', // TODO address type
                    true, // TODO connectable
                    advertisement,
                    message.rssi);
                break;

            case 'response':
                if (this._requests[message._id]) {
                    if (message.error) {
                        this._requests[message._id].reject(new Error(message.error));
                    } else {
                        this._requests[message._id].resolve(message.result);
                    }
                    delete this._requests[message._id];
                }
                break;

            case 'disconnectEvent':
                for (let address of Object.keys(this._deviceMap)) {
                    if (this._deviceMap[address] == message.device) {
                        this.emit('disconnect', address);
                    }
                }
                break;

            case 'valueChangedNotification':
                const { address, service, characteristic } = this._subscriptions[message.subscriptionId];
                this.emit('read', address, service, characteristic, Buffer.from(message.value), true);
                break;
        }
    }

    _sendMessage(message) {
        debug('out:', message);
        const dataBuf = Buffer.from(JSON.stringify(message), 'utf-8');
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeInt32LE(dataBuf.length, 0);
        this._bleServer.stdin.write(lenBuf);
        this._bleServer.stdin.write(dataBuf);
    }

    _sendRequest(message) {
        return new Promise((resolve, reject) => {
            const requestId = this._requestId++;
            this._requests[requestId] = { resolve, reject };
            this._sendMessage(Object.assign({}, message, { _id: requestId }));
        });
    }
}

exports.WinrtBindings = WinrtBindings;
