import { Component, OnInit, OnDestroy } from '@angular/core';
import { Http } from '@angular/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-pull-request',
  templateUrl: './pull-request.component.html',
  styleUrls: ['./pull-request.component.css']
})
export class PullRequestComponent implements OnInit {

  private pullPromise: any;
  private sub: any;

  constructor(private http: Http, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.sub = this.route.params.subscribe(params => {
        var org = params['org'];
        var repo = params['repo'];
        var id = params['id'];
        var url = environment.api_url + '/v1/' + org + '/'
                                      + repo + '/pull/' + id + '/';

        this.pullPromise = this.http
            .get(url, { withCredentials: true })
            .toPromise()
            .then(response => response.json());
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

}
