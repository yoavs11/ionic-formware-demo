import {ChangeDetectorRef, Component, NgZone} from '@angular/core';
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


const inhalerInfoParser = (id, data) => {
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

const noopParser = (id: any, hexReply: any): any => parseReply(hexReply).payload;

const chunkResponseParser = (id, data) => {
  const {payloadLen, payload} = parseReply(data);
  if (!payloadLen) {
    throw new Error(`no reply from chunk sending`)
  }

  return {
    success: payload[2] === 0
  };
}

const nonZeroErrorParser = (id, data) => {
  const {payloadLen, payload} = parseReply(data);
  if (!payloadLen) {
    throw new Error('No payload in inhaler reply to cmd 0x${hex(id)}. Expected an error value as payload[0]')
  }
  if (payload[0]) {
    throw new Error(`Inhaler reaplied with error code 0x${hex(payload[0])} to cmd 0x${hex(id)}.`)
  }
  return payload;
}

const hex = v => {
  if (Array.isArray(v)) {
    return v.reduce((all, curr) => all + hex(curr), "");
  }
  const s = v.toString(16);
  return s.length == 1 ? "0" + s : s;
};

const formatCommand = (id, payload = []) => {
  const coreMsg = [id, payload.length, ...payload];
  const checksum = coreMsg.reduce((all, curr) => all + curr) % 256;
  const msg = coreMsg.concat([checksum]);
  return new Uint8Array(msg)
};

const int16Bytes = v => [v >> 8, v & 255];

@Component({
  selector: 'page-detail',
  templateUrl: 'detail.html',
})
export class DetailPage {

  peripheral: any = {};
  statusMessage: string;
  inhalerInfo = {};

  constructor(public navCtrl: NavController,
              public navParams: NavParams,
              private ble: BLE,
              public bleProvider: BleProvider,
              private toastCtrl: ToastController,
              private changeDetection: ChangeDetectorRef,
              private ngZone: NgZone) {

    let device = navParams.get('device');

    this.setStatus('Connecting to ' + device.name || device.id);

    this.ble.connect(device.id).subscribe(
      peripheral => this.onConnected(peripheral),
      peripheral => this.onDeviceDisconnected(peripheral)
    );

  }


  async onConnected(peripheral) {
    this.ngZone.run(() => {
      this.setStatus('');
      this.peripheral = peripheral;
      this.bleProvider.createConnection(peripheral.id);
    });
  }

  async onFetchInhalerInfo() {
    this.inhalerInfo = await this.getInhalerInfo()
    this.changeDetection.detectChanges();
  }

  onDeviceDisconnected(peripheral) {
    let toast = this.toastCtrl.create({
      message: 'The peripheral unexpectedly disconnected',
      duration: 3000,
      position: 'middle'
    });
    this.bleProvider.ngOnDestroy();
    toast.present();
  }

  async testCmd() {
    try {
      console.log('starting');
      const isChanged = await this.changeMode(true);
      console.log({isChanged});
      const isStartDownload = await this.startDownload();
      console.log({isStartDownload})
      const size = 50;
      for (let i = 0; i < size; i++) {
        console.log(`chunk ${i}`)
        const chunk = Array(128).fill(i % 256)
        await this.sendChunk(i, chunk);
      }
      console.log('finished');
      const isUpdated = await this.updateFirmware();
      console.log({isUpdated})

      let toast = this.toastCtrl.create({
        message: isUpdated[0] === 0 ? 'Updated Duccessfully' : 'failed to update',
        duration: 3000,
        position: 'middle'
      });
      this.bleProvider.ngOnDestroy();
      await toast.present();
    } catch (e) {
      alert(e.message);
    }
  }

  private async sendCommand(id, parser = noopParser, extraData = []) {
    const res = await this.bleProvider.sendCommand(formatCommand(id, extraData));
    return parser(id, res)
  }

  private getInhalerInfo() {
    return this.sendCommand(0x01, inhalerInfoParser)
  }

  private async changeMode(isChangeToBoot: boolean) {
    return this.sendCommand(0x02, noopParser, [isChangeToBoot ? 0x01 : 0x00])
  }

  private async startDownload() {
    return this.sendCommand(0x03, nonZeroErrorParser)
  }

  private async sendChunk(chunckNum, chunckBytes) {
    // return this.sendCommand(0x04, chunkResponseParser, [...int16Bytes(chunckNum), ...chunckBytes])
    this.bleProvider.writeWithoutResponse(formatCommand(0x04, [...int16Bytes(chunckNum), ...chunckBytes]))
  }

  private async updateFirmware() {
    return this.sendCommand(0x05, nonZeroErrorParser)
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
