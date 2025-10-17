import { TestBed } from '@angular/core/testing';

import { Layer } from './layer';

describe('Layer', () => {
  let service: Layer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Layer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
