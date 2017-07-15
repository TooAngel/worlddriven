import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MdButtonModule, MdCheckboxModule, MdToolbarModule, MdIconModule, MdProgressSpinnerModule } from '@angular/material';
import { RouterModule }   from '@angular/router';
import { HttpModule } from '@angular/http';
import { NgModule } from '@angular/core';
import { AppComponent } from './app.component';
import { PullRequestComponent } from './pull-request/pull-request.component';

@NgModule({
  declarations: [
    AppComponent,
    PullRequestComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MdButtonModule,
    MdCheckboxModule,
    MdToolbarModule,
    MdIconModule,
    MdProgressSpinnerModule,
    HttpModule,
    RouterModule.forRoot([
      {
        path: ':org/:repo/pull/:id',
        component: PullRequestComponent
      }

    ])
  ],
  providers: [],
  bootstrap: [AppComponent]
})

export class AppModule { }
