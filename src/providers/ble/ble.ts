import {Injectable, OnDestroy} from '@angular/core';
import 'rxjs/add/operator/map';
import {BLE} from "@ionic-native/ble";
import {BehaviorSubject} from "rxjs/BehaviorSubject";
import {Subscription} from "rxjs/Subscription";
import 'rxjs/add/observable/empty';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/concatMap';
import 'rxjs/add/operator/take';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/concatAll';
import 'rxjs/add/operator/toPromise';
import {Observable} from "rxjs/Observable";
import {ReplaySubject} from "rxjs/ReplaySubject";
import {fromPromise} from 'rxjs/Observable/fromPromise';
import 'rxjs/add/observable/of';
import 'rxjs/add/operator/delay';


const serialPortServiceId = '0783B03E-8535-B5A0-7140-A304D2495CB7';
const serialPortReadNotifyCharactaristicId = '0783b03e-8535-b5a0-7140-a304d2495cb8';
const serialPortWriteCharactaristicId = '0783b03e-8535-b5a0-7140-a304d2495cba';
const serialPortFlowControlCharactaristicId = '0783b03e-8535-b5a0-7140-a304d2495cb9';

@Injectable()
export class BleProvider implements OnDestroy {

  private writeToInhalerWithoutResponseSubject: ReplaySubject<Uint8Array>;

  private flowControlSubscription: Subscription;
  private deviceId: string;


  constructor(private ble: BLE) {
    this.writeToInhalerWithoutResponseSubject = new ReplaySubject();
  }

  public createConnection(deviceId) {
    this.deviceId = deviceId;
    this.flowControlSubscription =
      this.ble.startNotification(
      this.deviceId,
      serialPortServiceId,
      serialPortFlowControlCharactaristicId)
      .switchMap((data) => {
        if (!data) {
          return Observable.empty();
        }
        const response = new Uint8Array(data);
        console.log({flowStatus: response[0]})
        return response[0] ? this.writeToInhalerWithoutResponseSubject : Observable.empty();
      })
        .map((value) => Observable.of(value).delay(50))
        .concatAll()
        .subscribe(async (data: Uint8Array) => {
          if (data) {
            await this.ble.writeWithoutResponse(this.deviceId, serialPortServiceId, serialPortWriteCharactaristicId, data.buffer)
          }
        })
  }

  public writeWithoutResponse(data: Uint8Array) {
    this.writeToInhalerWithoutResponseSubject.next(data);
  }

  public async sendCommand(command: Uint8Array) {
    return this.ble.startNotification(
      this.deviceId,
      serialPortServiceId,
      serialPortFlowControlCharactaristicId)
      .switchMap((data) => {
        if (!data) {
          return Observable.empty();
        }
        const response = new Uint8Array(data);
        console.log({flowStatus: response[0]})
        return response[0] ? fromPromise(this.ble.writeWithoutResponse(this.deviceId, serialPortServiceId, serialPortWriteCharactaristicId, command.buffer)) : Observable.empty();
      })
      .switchMap(() => this.ble.startNotification(
        this.deviceId,
        serialPortServiceId,
        serialPortReadNotifyCharactaristicId))
      .take(1).toPromise();
  }


  ngOnDestroy(): void {
    console.log('unsubscribe')
    if (this.flowControlSubscription) {
      this.flowControlSubscription.unsubscribe();
    }
  }


}
