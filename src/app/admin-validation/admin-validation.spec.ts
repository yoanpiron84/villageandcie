import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminValidation } from './admin-validation';

describe('AdminValidation', () => {
  let component: AdminValidation;
  let fixture: ComponentFixture<AdminValidation>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminValidation]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminValidation);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
