import { TestBed } from '@angular/core/testing';

import { Interaction } from './interaction';

describe('Interaction', () => {
  let service: Interaction;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Interaction);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
