export type Semester = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
};

export type Subject = {
  id: string;
  name: string;
  code: string;
  semesterId: string;
  color: string;
  createdAt: string;
};

export type StudyChunk = {
  id: string;
  text: string;
  page?: number;
};

export type StudyDocument = {
  id: string;
  name: string;
  type: 'pdf' | 'txt' | 'md';
  size: number;
  subjectId: string;
  addedAt: string;
  pageCount?: number;
  chunks: StudyChunk[];
};

export type AcademicTaskKind = 'exam' | 'goal' | 'syllabus' | 'revision';

export type AcademicTask = {
  id: string;
  title: string;
  kind: AcademicTaskKind;
  subjectId: string;
  dueDate: string;
  completed: boolean;
  progress: number;
  createdAt: string;
};

export type AcademicData = {
  semesters: Semester[];
  subjects: Subject[];
  documents: StudyDocument[];
  tasks: AcademicTask[];
};

export type RetrievedChunk = StudyChunk & {
  documentId: string;
  documentName: string;
  score: number;
};

export const EMPTY_ACADEMIC_DATA: AcademicData = {
  semesters: [],
  subjects: [],
  documents: [],
  tasks: []
};
