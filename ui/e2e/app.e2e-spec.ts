import { UiPage } from './app.po';

describe('ui App', () => {
  let page: UiPage;

  beforeEach(() => {
    page = new UiPage();
  });

  it('should display welcome message', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('Welcome to app!');
  });
});
