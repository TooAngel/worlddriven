import { Component, OnInit } from '@angular/core';
import { Http, Response, Headers, RequestOptions } from '@angular/http';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/operator/toPromise';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  public title = 'Democratic Collaboration';
  public sign_in_url = environment.api_url + '/login/';
  public sign_out_url = environment.api_url + '/logout/';
  public userPromise: object;

  constructor(private http: Http) {}

  ngOnInit(): void {
    this.userPromise = this.http
        .get(environment.api_url + '/v1/user/', { withCredentials: true })
        .toPromise()
        .then(response => response.json());
  }
}
