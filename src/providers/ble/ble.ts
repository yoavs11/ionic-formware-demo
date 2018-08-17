import {Injectable, OnDestroy} from '@angular/core';
import 'rxjs/add/operator/map';
import {BLE} from "@ionic-native/ble";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {Subscription} from "rxjs/Subscription";
import 'rxjs/add/observable/empty';
import 'rxjs/add/operator/switchMap';
import {Observable} from "rxjs/Observable";

const serialPortServiceId = '0783B03E-8535-B5A0-7140-A304D2495CB7';
const serialPortReadNotifyCharactaristicId = '0783b03e-8535-b5a0-7140-a304d2495cb8';
const serialPortWriteCharactaristicId = '0783b03e-8535-b5a0-7140-a304d2495cba';
const serialPortFlowControlCharactaristicId = '0783b03e-8535-b5a0-7140-a304d2495cb9';

@Injectable()
export class BleProvider implements OnDestroy {

  private inboundSubject: BehaviorSubject<any>;
  private outboundSubject: BehaviorSubject<Uint8Array>;

  private inboundSubscription: Subscription;
  private flowControlSubscription: Subscription;
  private deviceId: string;


  constructor(private ble: BLE) {
    this.inboundSubject = new BehaviorSubject(null);
    this.outboundSubject = new BehaviorSubject(new Uint8Array([0x01, 0x00, 0x01]));
  }

  public createConnection(deviceId) {
    this.deviceId = deviceId;
    this.inboundSubscription = this.ble.startNotification(
      this.deviceId,
      serialPortServiceId,
      serialPortReadNotifyCharactaristicId)
      .subscribe(this.inboundSubject);

    this.flowControlSubscription = this.ble.startNotification(
      this.deviceId,
      serialPortServiceId,
      serialPortFlowControlCharactaristicId)
      .switchMap((data) => {
        if (!data) {
          return Observable.empty();
        }
        const response = new Uint8Array(data);
        return response[0] ? this.outboundSubject : Observable.empty();
      })
      .subscribe(
        (data: Uint8Array) =>
        this.ble.writeWithoutResponse(this.deviceId, serialPortServiceId, serialPortWriteCharactaristicId, data.buffer)
      );
  }

  public async write(data: Uint8Array) {
    this.outboundSubject.next(data);
  }

  public readValue() {
    return this.inboundSubject.asObservable();
  }

  ngOnDestroy(): void {
    if (this.inboundSubscription) {
      this.inboundSubscription.unsubscribe();
    }
    if (this.flowControlSubscription) {
      this.flowControlSubscription.unsubscribe();
    }
  }


}
