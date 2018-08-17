import {Component, NgZone} from '@angular/core';
import {NavController, NavParams} from 'ionic-angular';
import {ToastController} from 'ionic-angular';
import {BLE} from '@ionic-native/ble';
import {BleProvider} from "../../providers/ble/ble";

const InhalerModes = {
  MAIN: 0x00,
  BOOTLOADER: 0x01
};

const InhalerMainStates = {
  SLEEP: 0x00,
  STARTUP: 0x01,
  UI: 0x02,
  INHALATION: 0x03
};

const findEnumName = (e, v) => Object.keys(e).find(k => e[k] = v)

const parseReply = data => {
  const reply = new Uint8Array(data);
  const id = reply[0];
  const payloadLen = reply[1];
  const checksum = reply[reply.length - 1];
  const payload = reply.slice(2, reply.length - 1);
  return {
    id, payloadLen, payload, checksum
  }
}


const inhalerInfoParser = (data) => {
  if (!data) {
    return {res: 'GOT NULL!'}
  }
  const {payload} = parseReply(data);
  return {
    state: payload[0],
    stateName: findEnumName(InhalerMainStates, payload[0]),
    mode: payload[1],
    modeName: findEnumName(InhalerModes, payload[1]),
    bootVersion: {
      major: payload[2],
      minor: payload[3],
    },
    firmwareVersion: {
      major: payload[4],
      minor: payload[5],
      revision: payload[6],
      variant: payload[7],
    },
    buildNumber: (((payload[8] & 0xFF) << 24) | ((payload[9] & 0xFF) << 16) | ((payload[10] & 0xFF) << 8) | (payload[11] & 0xFF))
  }
}

@Component({
  selector: 'page-detail',
  templateUrl: 'detail.html',
})
export class DetailPage {

  peripheral: any = {};
  statusMessage: string;
  deviceOutput = {};

  constructor(public navCtrl: NavController,
              public navParams: NavParams,
              private ble: BLE,
              public bleProvider: BleProvider,
              private toastCtrl: ToastController,
              private ngZone: NgZone) {

    let device = navParams.get('device');

    this.setStatus('Connecting to ' + device.name || device.id);

    this.ble.connect(device.id).subscribe(
      peripheral => this.onConnected(peripheral),
      peripheral => this.onDeviceDisconnected(peripheral)
    );

  }


  onConnected(peripheral) {
    this.ngZone.run(() => {
      this.setStatus('');
      this.peripheral = peripheral;
    });

    this.bleProvider.createConnection(peripheral.id);
    this.bleProvider.readValue().subscribe(readData => {
      this.deviceOutput = inhalerInfoParser(readData);
      console.log({result: this.deviceOutput});
    });
  }

  onDeviceDisconnected(peripheral) {
    let toast = this.toastCtrl.create({
      message: 'The peripheral unexpectedly disconnected',
      duration: 3000,
      position: 'middle'
    });
    toast.present();
  }

  // Disconnect peripheral when leaving the page
  ionViewWillLeave() {
    console.log('ionViewWillLeave disconnecting Bluetooth');
    this.ble.disconnect(this.peripheral.id).then(
      () => console.log('Disconnected ' + JSON.stringify(this.peripheral)),
      () => console.log('ERROR disconnecting ' + JSON.stringify(this.peripheral))
    )
  }

  setStatus(message) {
    console.log(message);
    this.ngZone.run(() => {
      this.statusMessage = message;
    });
  }

}
